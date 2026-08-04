import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Observability (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
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

    const issued = await app
      .get(IssueActorCredentialUseCase)
      .execute({ actorType: "AGENT", actorId: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    return {
      token,
      agentToken: issued.value.token,
      organizationId,
      workspaceId,
      auth: (r: request.Test) => r.set("Authorization", `Bearer ${token}`),
      base: `/workspaces/${workspaceId}/health`,
    };
  }

  it("reports a healthy workspace with every probe accounted for", async () => {
    const ctx = await setup();

    const health = await ctx.auth(request(http).get(ctx.base)).expect(200);

    expect(health.body.level).toBe("HEALTHY");
    expect(health.body.totalDegraded).toBe(0);
    expect(health.body.signals.map((s: { probe: string }) => s.probe).sort()).toEqual([
      "audit_chain",
      "blocked_tasks",
      "locks",
      "pending_validations",
    ]);
  });

  /**
   * §17.8, the only section of the chapter quoting a production observation:
   * "21 commandes runtime bloquées" with no way to know which ones is an
   * alert nobody can act on. The count is derived from the list, so it can be
   * neither published alone nor made to disagree with its own detail.
   */
  it("never reports a count without naming what is behind it", async () => {
    const ctx = await setup();
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);

    // Two locks whose leases have long run out and that nobody reclaimed.
    for (const port of ["5433", "5434"]) {
      await asAgent(request(http).post(`/workspaces/${ctx.workspaceId}/locks`))
        .send({ resourceType: "port", resourceId: port, reason: "testing", ttlMs: 1 })
        .expect(201);
    }
    await prisma.resourceLock.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { expiresAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const health = await ctx.auth(request(http).get(ctx.base)).expect(200);
    const locks = health.body.signals.find((s: { probe: string }) => s.probe === "locks");

    expect(locks.count).toBe(2);
    // The count is never alone: identifier, type and since-when, as §17.8 asks.
    expect(locks.resources).toHaveLength(2);
    expect(locks.count).toBe(locks.resources.length);
    for (const resource of locks.resources) {
      expect(resource.id).toBeDefined();
      expect(resource.type).toBe("lock:port");
      expect(resource.since).toBeDefined();
      expect(resource.degradedForMs).toBeGreaterThan(0);
    }
    expect(health.body.level).toBe("WARNING");
  });

  /** §17.7 — thresholds are adjustable parameters, and the answer says which applied. */
  it("takes its staleness window from a workspace policy, and says so", async () => {
    const ctx = await setup();
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    await asAgent(request(http).post(`/workspaces/${ctx.workspaceId}/locks`))
      .send({ resourceType: "port", resourceId: "5433", reason: "testing", ttlMs: 1 })
      .expect(201);
    await prisma.resourceLock.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const byDefault = await ctx.auth(request(http).get(ctx.base)).expect(200);
    const before = byDefault.body.signals.find(
      (s: { probe: string }) => s.probe === "locks",
    );
    // A minute out of date is nothing against the documented default.
    expect(before.threshold.source).toBe("default");
    expect(before.count).toBe(0);

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "staleness_locks_ms",
        value: 1000,
      })
      .expect(201);

    const tightened = await ctx.auth(request(http).get(ctx.base)).expect(200);
    const after = tightened.body.signals.find(
      (s: { probe: string }) => s.probe === "locks",
    );
    expect(after.threshold).toEqual({ ms: 1000, source: "policy" });
    expect(after.count).toBe(1);
  });

  /**
   * The gravest signal the system can raise, and one with no scale: the
   * history has been edited. Grading it would suggest a few tampered entries
   * are tolerable.
   */
  it("turns unhealthy the moment the audit chain is broken", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "COST",
        rule: "max_tokens",
        value: 100,
      })
      .expect(201);

    expect((await ctx.auth(request(http).get(ctx.base))).body.level).toBe("HEALTHY");

    const entry = await prisma.auditEntry.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    await prisma.auditEntry.update({
      where: { id: entry!.id },
      data: { after: { tampered: true } },
    });

    const health = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(health.body.level).toBe("UNHEALTHY");
    const chain = health.body.signals.find(
      (s: { probe: string }) => s.probe === "audit_chain",
    );
    // Named, not counted: which entry, and since when.
    expect(chain.resources[0].id).toBe(entry!.id);
    expect(chain.reason).toContain("signature chain breaks");
    // A declared condition carries no threshold, and does not pretend to.
    expect(chain.threshold).toBeNull();
  });

  /** The worst signal decides — a system is not healthy on average. */
  it("takes the worst signal even when everything else is fine", async () => {
    const ctx = await setup();
    const entryless = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(entryless.body.level).toBe("HEALTHY");

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "COST",
        rule: "max_tokens",
        value: 100,
      })
      .expect(201);
    const entry = await prisma.auditEntry.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    await prisma.auditEntry.update({
      where: { id: entry!.id },
      data: { signature: "0".repeat(64) },
    });

    const health = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(health.body.level).toBe("UNHEALTHY");
    // The other three are still reported healthy, side by side with it.
    expect(
      health.body.signals.filter((s: { level: string }) => s.level === "HEALTHY"),
    ).toHaveLength(3);
  });

  it("never reports another workspace's health, and requires membership", async () => {
    const ctx = await setup();
    const other = await ctx
      .auth(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    await asAgent(request(http).post(`/workspaces/${ctx.workspaceId}/locks`))
      .send({ resourceType: "port", resourceId: "5433", reason: "testing", ttlMs: 1 })
      .expect(201);
    await prisma.resourceLock.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { expiresAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const elsewhere = await ctx
      .auth(request(http).get(`/workspaces/${other.body.workspaceId}/health`))
      .expect(200);
    expect(elsewhere.body.level).toBe("HEALTHY");
    expect(elsewhere.body.totalDegraded).toBe(0);

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
