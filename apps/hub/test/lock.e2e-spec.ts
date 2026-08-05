import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Lock (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
  });

  beforeEach(async () => {
    await resetDatabase(app.get(PrismaService));
  });

  afterAll(async () => {
    await app.close();
  });

  async function setup() {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "owner@example.com", password: "a-strong-password" })
      .expect(200);
    const token = logged.body.accessToken as string;
    const organizationId = registered.body.organizationId as string;
    const workspace = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId, name: "Core" })
      .expect(201);
    const workspaceId = workspace.body.workspaceId as string;

    // Two DISTINCT agents. §13.7 is explicit that a conflict scenario run
    // with the same actor on both sides proves nothing — that mistake shipped
    // once (0.3.5) and left the real path uncovered.
    const tokens: Record<string, string> = {};
    for (const agentId of ["a-holder", "a-challenger"]) {
      const issued = await app
        .get(IssueActorCredentialUseCase)
        .execute({
          actorType: "AGENT",
          actorId: agentId,
          organizationId,
          displayName: agentId,
        });
      tokens[agentId] = issued.value.token;
      await app.get(GrantWorkspaceMembershipUseCase).execute({
        actorType: "AGENT",
        actorId: agentId,
        workspaceId,
        role: "AGENT_CONTRIBUTOR",
      });
    }

    return {
      token,
      tokens,
      organizationId,
      workspaceId,
      base: `/workspaces/${workspaceId}/locks`,
    };
  }

  const takePort = (reason: string, ttlMs?: number) => ({
    resourceType: "port",
    resourceId: "5433",
    reason,
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });

  /** §13.7, first path — the very same actor. Idempotent, no new state. */
  it("re-acquiring your own lock is idempotent", async () => {
    const ctx = await setup();
    const asHolder = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-holder"]}`);

    const first = await asHolder(request(http).post(ctx.base))
      .send(takePort("running the suite"))
      .expect(201);
    expect(first.body.reacquired).toBe(false);

    const again = await asHolder(request(http).post(ctx.base))
      .send(takePort("running the suite"))
      .expect(201);

    expect(again.body.reacquired).toBe(true);
    expect(again.body.lockId).toBe(first.body.lockId);

    const held = await asHolder(request(http).get(ctx.base)).expect(200);
    expect(held.body).toHaveLength(1);
  });

  /**
   * §13.7, second path — a DIFFERENT actor. This is the scenario the earlier
   * codebase never covered, and the reason the spec devotes a paragraph to it.
   */
  it("acquiring a lock held by a different actor is a real conflict", async () => {
    const ctx = await setup();
    const asHolder = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-holder"]}`);
    const asChallenger = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-challenger"]}`);

    await asHolder(request(http).post(ctx.base))
      .send(takePort("running the suite"))
      .expect(201);

    const refused = await asChallenger(request(http).post(ctx.base))
      .send(takePort("also want the port"))
      .expect(409);

    // §17.8 — it says who holds it and until when, not merely "no".
    expect(refused.body.message).toContain("a-holder");
    expect(refused.body.message).toMatch(/until \d{4}-/);

    // And the challenger cannot manage what it does not hold.
    const locks = await asHolder(request(http).get(ctx.base)).expect(200);
    await asChallenger(request(http).post(`${ctx.base}/${locks.body[0].id}`))
      .send({ action: "RELEASE" })
      .expect(403);
  });

  it("frees the resource once released, for whoever wants it next", async () => {
    const ctx = await setup();
    const asHolder = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-holder"]}`);
    const asChallenger = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-challenger"]}`);

    const taken = await asHolder(request(http).post(ctx.base))
      .send(takePort("running the suite"))
      .expect(201);
    await asHolder(request(http).post(`${ctx.base}/${taken.body.lockId}`))
      .send({ action: "RELEASE" })
      .expect(200);

    await asChallenger(request(http).post(ctx.base))
      .send(takePort("my turn"))
      .expect(201);

    // Released, not deleted: what governed the past stays readable (§18.7).
    const all = await asHolder(
      request(http).get(`${ctx.base}?includeInactive=true`),
    ).expect(200);
    expect(all.body).toHaveLength(2);
    expect(all.body.some((l: { status: string }) => l.status === "RELEASED")).toBe(true);
  });

  /** §13.5 — automatic, never permanent. A dead lease blocks nobody. */
  it("an expired lease stops blocking, and its holder is told", async () => {
    const ctx = await setup();
    const asHolder = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-holder"]}`);
    const asChallenger = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-challenger"]}`);

    await asHolder(request(http).post(ctx.base))
      .send(takePort("a very short hold", 1))
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // No sweeper ran; the challenger simply gets it.
    await asChallenger(request(http).post(ctx.base))
      .send(takePort("the lease is dead"))
      .expect(201);

    // §17.9 — the previous holder learns it, which is what it cannot deduce.
    const unread = await asHolder(
      request(http).get(`/workspaces/${ctx.workspaceId}/notifications/unread/mine`),
    ).expect(200);
    expect(
      unread.body.some((entry: { notification: { title: string } }) =>
        entry.notification.title.startsWith("Lease expired"),
      ),
    ).toBe(true);
  });

  /** §12.1 "limites" — the second real consumer of the Policy Engine. */
  it("caps a lease at the ceiling the workspace sets", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asHolder = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-holder"]}`);

    await asOwner(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "max_lock_ttl_ms",
        value: 60000,
      })
      .expect(201);

    const taken = await asHolder(request(http).post(ctx.base))
      .send(takePort("asking for an hour", 3600000))
      .expect(201);

    // Clamped, and what was actually granted is visible in the response.
    const granted = new Date(taken.body.expiresAt).getTime() - Date.now();
    expect(granted).toBeLessThanOrEqual(60000);
    expect(granted).toBeGreaterThan(50000);
  });

  it("lets an operator force a release, but never a renewal", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asHolder = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-holder"]}`);

    const taken = await asHolder(request(http).post(ctx.base))
      .send(takePort("gone quiet"))
      .expect(201);

    // Extending someone else's hold is never delegated.
    await asOwner(request(http).post(`${ctx.base}/${taken.body.lockId}`))
      .send({ action: "RENEW", ttlMs: 60000 })
      .expect(403);

    await asOwner(request(http).post(`${ctx.base}/${taken.body.lockId}`))
      .send({ action: "RELEASE" })
      .expect(200);
    expect((await asHolder(request(http).get(ctx.base)).expect(200)).body).toHaveLength(0);
  });

  it("never reaches another workspace's locks", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asHolder = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-holder"]}`);
    const other = await asOwner(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);
    const taken = await asHolder(request(http).post(ctx.base))
      .send(takePort("mine"))
      .expect(201);

    await asOwner(
      request(http).post(
        `/workspaces/${other.body.workspaceId}/locks/${taken.body.lockId}`,
      ),
    )
      .send({ action: "RELEASE" })
      .expect(404);

    // The same resource name in another workspace is a different resource.
    await asOwner(request(http).post(`/workspaces/${other.body.workspaceId}/locks`))
      .send(takePort("same name, other workspace"))
      .expect(201);
  });

  it("requires authentication and membership", async () => {
    const ctx = await setup();
    await request(http).get(ctx.base).expect(401);

    await request(http)
      .post("/auth/register")
      .send({ email: "s@example.com", password: "a-strong-password", displayName: "S" })
      .expect(201);
    const stranger = await request(http)
      .post("/auth/login")
      .send({ email: "s@example.com", password: "a-strong-password" })
      .expect(200);

    await request(http)
      .get(ctx.base)
      .set("Authorization", `Bearer ${stranger.body.accessToken}`)
      .expect(403);
  });
});
