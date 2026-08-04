import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Runtime (e2e)", () => {
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

    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const asAgent = (r: request.Test) =>
      r.set("Authorization", `Bearer ${issued.value.token}`);

    const worker = await auth(request(http).post("/runtime/workers"))
      .send({
        hostname: "workshop-01",
        architecture: "x86_64",
        operatingSystem: "linux",
        capabilities: ["docker", "node"],
      })
      .expect(201);

    return {
      auth,
      asAgent,
      organizationId,
      workspaceId,
      workerId: worker.body.workerId as string,
      base: `/workspaces/${workspaceId}/runtime`,
    };
  }

  /**
   * §6.3 and §18.8 — the bug the spec records (0.3.2): attaching a machine to
   * a workspace cannot require the machine to already belong to it, since
   * that is precisely what attaching establishes.
   */
  it("attaches a machine that belongs to no workspace yet", async () => {
    const ctx = await setup();

    // Before attaching, the workspace sees nothing — and that is not an error.
    expect(
      (await ctx.auth(request(http).get(`${ctx.base}/workers`)).expect(200)).body,
    ).toEqual([]);

    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);

    const workers = await ctx.auth(request(http).get(`${ctx.base}/workers`)).expect(200);
    expect(workers.body).toHaveLength(1);
    expect(workers.body[0].hostname).toBe("workshop-01");
    expect(workers.body[0].stale).toBe(false);
  });

  it("registers the same machine twice as the same machine", async () => {
    const ctx = await setup();

    const again = await ctx
      .auth(request(http).post("/runtime/workers"))
      .send({
        hostname: "workshop-01",
        architecture: "x86_64",
        operatingSystem: "linux",
      })
      .expect(201);

    // A worker that restarts is the same worker; letting it multiply would
    // leave phantom machines the staleness probe reports forever.
    expect(again.body.workerId).toBe(ctx.workerId);
  });

  /** §6.10 — "le Runtime ne reçoit jamais les tâches étrangères". */
  it("refuses a session on a machine that does not serve the workspace", async () => {
    const ctx = await setup();

    await ctx
      .asAgent(request(http).post(`${ctx.base}/sessions`))
      .send({
        workerId: ctx.workerId,
        agentType: "AGENT",
        agentId: "a-1",
        provider: "claude",
      })
      .expect(403);

    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);

    await ctx
      .asAgent(request(http).post(`${ctx.base}/sessions`))
      .send({
        workerId: ctx.workerId,
        agentType: "AGENT",
        agentId: "a-1",
        provider: "claude",
      })
      .expect(201);
  });

  /**
   * §4.12's transition invariant (0.3.4): already in the target state, or out
   * of a terminal one, gives a typed result — never an unhandled exception.
   */
  it("answers a repeated stop, and refuses to revive a stopped session", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);
    const session = await ctx
      .asAgent(request(http).post(`${ctx.base}/sessions`))
      .send({
        workerId: ctx.workerId,
        agentType: "AGENT",
        agentId: "a-1",
        provider: "claude",
      })
      .expect(201);
    const at = `${ctx.base}/sessions/${session.body.sessionId}`;

    await ctx.asAgent(request(http).post(at)).send({ status: "STOPPED" }).expect(200);
    // Already there: a success with nothing done, not an exception.
    await ctx.asAgent(request(http).post(at)).send({ status: "STOPPED" }).expect(200);
    // Out of a terminal state: refused, and the refusal says it is gone.
    await ctx.asAgent(request(http).post(at)).send({ status: "RUNNING" }).expect(410);
  });

  /**
   * §4.14 (0.3.9) — the bug this exists to make impossible: restoring a
   * provider without clearing its quota window is silently a no-op.
   */
  it("restores a provider for real, clearing the quota window with it", async () => {
    const ctx = await setup();
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await ctx
      .auth(request(http).post("/runtime/providers/claude/availability"))
      .send({ action: "QUOTA_EXHAUSTED", until, reason: "exit code 3, stderr: 429" })
      .expect(200);
    await ctx
      .auth(request(http).post("/runtime/providers/claude/availability"))
      .send({ action: "DISABLE" })
      .expect(200);

    let providers = await ctx.auth(request(http).get("/runtime/providers")).expect(200);
    expect(providers.body[0].effectiveAvailable).toBe(false);

    await ctx
      .auth(request(http).post("/runtime/providers/claude/availability"))
      .send({ action: "RESTORE" })
      .expect(200);

    providers = await ctx.auth(request(http).get("/runtime/providers")).expect(200);
    expect(providers.body[0].effectiveAvailable).toBe(true);
    // The window is gone, so the restore is not a no-op until it expires.
    expect(providers.body[0].quotaUnavailableUntil).toBeNull();
    expect(providers.body[0].quotaReason).toBeNull();
  });

  it("never invents a quota reason when an operator simply switches it off", async () => {
    const ctx = await setup();

    await ctx
      .auth(request(http).post("/runtime/providers/codex/availability"))
      .send({ action: "DISABLE" })
      .expect(200);

    const providers = await ctx.auth(request(http).get("/runtime/providers")).expect(200);
    const codex = providers.body.find((p: { provider: string }) => p.provider === "codex");
    expect(codex.available).toBe(false);
    expect(codex.quotaReason).toBeNull();
  });

  /** §4.14 — a provider out of quota takes no new work, with the reason. */
  it("refuses a session on a provider that is out of quota", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);
    await ctx
      .auth(request(http).post("/runtime/providers/claude/availability"))
      .send({
        action: "QUOTA_EXHAUSTED",
        until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason: "exit code 3, stderr: 429",
      })
      .expect(200);

    const refused = await ctx
      .asAgent(request(http).post(`${ctx.base}/sessions`))
      .send({
        workerId: ctx.workerId,
        agentType: "AGENT",
        agentId: "a-1",
        provider: "claude",
      })
      .expect(409);
    expect(refused.body.message).toContain("429");
  });

  /**
   * §4.14 (0.3.8) — a provider lockout is account-wide, so only a human sets
   * it. An agent that writes "429" in its own output can lock nobody out,
   * because nothing here reads what an agent produced.
   */
  it("lets no agent change a provider's availability", async () => {
    const ctx = await setup();

    await ctx
      .asAgent(request(http).post("/runtime/providers/claude/availability"))
      .send({ action: "DISABLE" })
      .expect(403);
  });

  /**
   * §17.7 named Machine and Session from the start; observability was written
   * with a slot for them and did not have to change to accept them.
   */
  it("reports a silent machine and a silent session in the workspace health", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);
    await ctx
      .asAgent(request(http).post(`${ctx.base}/sessions`))
      .send({
        workerId: ctx.workerId,
        agentType: "AGENT",
        agentId: "a-1",
        provider: "claude",
      })
      .expect(201);

    const healthy = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/health`))
      .expect(200);
    expect(healthy.body.level).toBe("HEALTHY");
    expect(healthy.body.signals.map((s: { probe: string }) => s.probe)).toContain(
      "workers",
    );

    // Both fall silent.
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.workerNode.updateMany({ data: { lastHeartbeatAt: longAgo } });
    await prisma.agentSession.updateMany({ data: { lastHeartbeatAt: longAgo } });

    const degraded = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/health`))
      .expect(200);
    const workers = degraded.body.signals.find(
      (s: { probe: string }) => s.probe === "workers",
    );
    const sessions = degraded.body.signals.find(
      (s: { probe: string }) => s.probe === "sessions",
    );
    // Named, not counted — §17.8 all the way through.
    expect(workers.resources[0].type).toBe("worker:workshop-01");
    expect(sessions.resources[0].type).toBe("session:claude");
    expect(degraded.body.level).not.toBe("HEALTHY");
  });

  it("never shows a machine to a workspace it does not serve", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);
    const other = await ctx
      .auth(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);

    expect(
      (
        await ctx.auth(
          request(http).get(`/workspaces/${other.body.workspaceId}/runtime/workers`),
        )
      ).body,
    ).toEqual([]);
  });

  it("requires authentication", async () => {
    await request(http).get("/runtime/providers").expect(401);
    await request(http)
      .post("/runtime/workers")
      .send({ hostname: "x", architecture: "y", operatingSystem: "z" })
      .expect(401);
  });
});
