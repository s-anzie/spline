import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Audit (e2e)", () => {
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

    return {
      token,
      organizationId,
      workspaceId,
      base: `/workspaces/${workspaceId}/audit`,
    };
  }

  /**
   * §18.7 names the actions that must leave a trail. Three have a producer
   * today; the other four belong to modules that do not exist and are not
   * simulated.
   */
  it("records what changed, from what to what, for the actions §18.7 names", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    // Policy Update
    const policy = await auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "timeout",
        value: 600,
      })
      .expect(201);
    await auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "timeout",
        value: 900,
      })
      .expect(201);

    // Permission Change
    const members = await auth(
      request(http).get(`/workspaces/${ctx.workspaceId}/members`),
    ).expect(200);
    await auth(
      request(http).patch(
        `/workspaces/${ctx.workspaceId}/members/${members.body[0].membershipId}`,
      ),
    )
      .send({ role: "OWNER" })
      .expect(200);

    const trail = await auth(request(http).get(ctx.base)).expect(200);
    const actions = trail.body.map((e: { action: string }) => e.action);
    expect(actions).toContain("policy.updated");

    // The update carries the previous value — the one thing an Event cannot.
    const updated = trail.body.find(
      (e: { action: string; before: unknown }) =>
        e.action === "policy.updated" && e.before !== null,
    );
    expect(updated.before.value).toBe(600);
    expect(updated.after.value).toBe(900);
    expect(updated.target.id).toBe(policy.body.policyId);

    // A creation has no before; that is a fact about it, not a gap.
    const created = trail.body.find(
      (e: { action: string; before: unknown }) =>
        e.action === "policy.updated" && e.before === null,
    );
    expect(created.after.rule).toBe("timeout");
  });

  it("audits a deletion, which is a status here and not a row removal", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    await auth(request(http).post(`/workspaces/${ctx.workspaceId}/archive`)).expect(200);
    await auth(request(http).post(`/workspaces/${ctx.workspaceId}/delete`)).expect(200);

    const trail = await auth(request(http).get(`${ctx.base}?action=workspace.deleted`));
    expect(trail.body).toHaveLength(1);
    expect(trail.body[0].before.status).toBe("ARCHIVED");
    expect(trail.body[0].after.status).toBe("DELETED");
    // Archiving is ordinary workspace life and would only add noise.
    expect(
      (await auth(request(http).get(ctx.base))).body.some(
        (e: { action: string }) => e.action === "workspace.archived",
      ),
    ).toBe(false);
  });

  /**
   * §4.23 calls the audit immutable. A Postgres table is immutable for nobody
   * with database access, so the honest meaning is that tampering is
   * detectable — and detectable WHERE (§17.8).
   */
  it("detects a tampered entry and says exactly where the chain breaks", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    for (const value of [100, 200, 300]) {
      await auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
        .send({
          scopeType: "WORKSPACE",
          scopeId: ctx.workspaceId,
          type: "COST",
          rule: `max_${value}`,
          value,
        })
        .expect(201);
    }

    const intact = await auth(request(http).get(`${ctx.base}/verify`)).expect(200);
    expect(intact.body.intact).toBe(true);
    expect(intact.body.checked).toBe(3);

    // Someone edits the trail straight in the database.
    const second = await prisma.auditEntry.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { sequence: "asc" },
      skip: 1,
    });
    await prisma.auditEntry.update({
      where: { id: second!.id },
      data: { after: { rule: "max_200", value: 999999 } },
    });

    const broken = await auth(request(http).get(`${ctx.base}/verify`)).expect(200);
    expect(broken.body.intact).toBe(false);
    expect(broken.body.brokenAt.id).toBe(second!.id);
  });

  it("detects a deleted entry, not only a modified one", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    for (const value of [100, 200, 300]) {
      await auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
        .send({
          scopeType: "WORKSPACE",
          scopeId: ctx.workspaceId,
          type: "COST",
          rule: `max_${value}`,
          value,
        })
        .expect(201);
    }

    const first = await prisma.auditEntry.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { sequence: "asc" },
    });
    await prisma.auditEntry.delete({ where: { id: first!.id } });

    expect((await auth(request(http).get(`${ctx.base}/verify`))).body.intact).toBe(false);
  });

  it("offers no way to write, change or erase an entry", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    await auth(request(http).post(ctx.base))
      .send({ action: "invented.past", targetType: "x", targetId: "y" })
      .expect(404);
    await auth(request(http).delete(ctx.base)).expect(404);
  });

  it("never reaches another workspace's trail, and reading it is administrative", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const other = await auth(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);

    await auth(request(http).post(`/workspaces/${ctx.workspaceId}/policies`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "timeout",
        value: 600,
      })
      .expect(201);

    expect(
      (
        await auth(
          request(http).get(`/workspaces/${other.body.workspaceId}/audit`),
        ).expect(200)
      ).body,
    ).toHaveLength(0);

    await request(http).get(ctx.base).expect(401);

    // A member who is not an administrator does not read who changed what.
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
