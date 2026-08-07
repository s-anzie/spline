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
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId, displayName: "a-1" });
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

  /**
   * §6.6 — "aucune tâche ne doit disparaître". A task whose session died
   * stayed RUNNING with nobody running it: the scheduler counted it in
   * flight, so it appeared in neither the ready queue nor the waiting list.
   * Invisible is lost, whatever the row says.
   */
  it("brings back a task whose session died", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);
    const goal = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);
    const task = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Long job",
        acceptanceCriteria: ["done"],
        assigneeType: "AGENT",
        assigneeId: "a-1",
      })
      .expect(201);
    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await ctx
        .asAgent(
          request(http).post(
            `/workspaces/${ctx.workspaceId}/tasks/${task.body.taskId}/status`,
          ),
        )
        .send({ status })
        .expect(200);
    }
    await ctx
      .asAgent(request(http).post(`${ctx.base}/sessions`))
      .send({
        workerId: ctx.workerId,
        agentType: "AGENT",
        agentId: "a-1",
        provider: "claude",
        taskId: task.body.taskId,
      })
      .expect(201);

    // Before: the task is in flight and shows up nowhere actionable.
    const before = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/schedule`))
      .expect(200);
    expect(before.body.summary.inFlightCount).toBe(1);
    expect(before.body.ready).toHaveLength(0);
    expect(before.body.waiting).toHaveLength(0);

    // The session and its machine both fall silent.
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.agentSession.updateMany({ data: { lastHeartbeatAt: longAgo } });

    const report = await ctx
      .auth(request(http).post(`${ctx.base}/recover`))
      .expect(200);
    expect(report.body.recovered).toHaveLength(1);
    expect(report.body.recovered[0].taskId).toBe(task.body.taskId);

    // After: the task is out of flight and visible again — FAILED, because
    // nobody knows how far the interrupted work got.
    const after = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/tasks/${task.body.taskId}`))
      .expect(200);
    expect(after.body.status).toBe("FAILED");
    expect(after.body.allowedStatusTargets).toContain("ASSIGNED");
  });

  /**
   * §6.8 — "le hub DÉCIDE et enfile". The decision is the hub's, and it was
   * reachable with `execute_tasks`, which an AGENT_CONTRIBUTOR holds.
   *
   * That is the OpenClaw chain end to end: an agent reads a poisoned README,
   * the injected instruction makes it enqueue a command, and the worker runs
   * that command on the operator's own machine. The agent never had to be
   * malicious — it only had to read.
   *
   * Operating a machine is a human act. No agent role holds
   * `manage_machines`, and that is the point.
   */
  it("refuses to let an agent enqueue an order for a machine", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);

    await ctx
      .asAgent(request(http).post(`${ctx.base}/commands`))
      .send({ workerId: ctx.workerId, type: "ExecuteTask", payload: { cmd: "curl" } })
      .expect(403);
  });

  /**
   * §18.3 — the actor a session runs as came straight from the request body
   * and was never checked. Any member with `execute_tasks` could open a
   * session attributed to an agent that belongs to another workspace, or to
   * no workspace at all: every event and every audit entry would then name
   * an actor that never acted. Attribution forged at the door (§4.2).
   */
  it("refuses to start a session for an actor that is not a member here", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);

    await ctx
      .auth(request(http).post(`${ctx.base}/sessions`))
      .send({
        workerId: ctx.workerId,
        agentType: "AGENT",
        agentId: "a-from-somewhere-else",
        provider: "claude",
      })
      .expect(403);
  });

  /** §6.8 — the hub decides and enqueues; the worker pulls and reports. */
  it("hands a worker its orders, one holder at a time", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);

    const command = await ctx
      .auth(request(http).post(`${ctx.base}/commands`))
      .send({ workerId: ctx.workerId, type: "ExecuteTask", payload: { taskId: "t-1" } })
      .expect(201);

    const claimed = await ctx
      .auth(
        request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`),
      )
      .send({})
      .expect(200);
    expect(claimed.body).toHaveLength(1);
    expect(claimed.body[0].payload).toEqual({ taskId: "t-1" });

    // Claiming again gets nothing: an order is served once.
    expect(
      (
        await ctx
          .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
          .send({})
      ).body,
    ).toHaveLength(0);

    await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/${command.body.commandId}/report`,
        ),
      )
      .send({ outcome: "COMPLETED", result: { exitCode: 0 } })
      .expect(200);

    const listed = await ctx.auth(request(http).get(`${ctx.base}/commands`)).expect(200);
    expect(listed.body[0].status).toBe("COMPLETED");
    expect(listed.body[0].result).toEqual({ exitCode: 0 });
  });

  /**
   * §18 — a machine's own routes carry the machine's id in the path, and
   * nothing used to bind that id to the caller. Any authenticated actor,
   * including the least privileged one in the workspace, could claim the
   * orders addressed to somebody else's machine: it received their payloads,
   * and the real machine never got them because they were already CLAIMED.
   *
   * The machine belongs to whoever registered it, and only that actor may
   * speak as it.
   */
  it("refuses to let another actor speak as a machine", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);
    await ctx
      .auth(request(http).post(`${ctx.base}/commands`))
      .send({ workerId: ctx.workerId, type: "ExecuteTask", payload: { secret: "x" } })
      .expect(201);

    await ctx
      .asAgent(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(403);

    await ctx
      .asAgent(request(http).post(`/runtime/workers/${ctx.workerId}/heartbeat`))
      .send({})
      .expect(403);

    // And the orders are still there for the machine they were addressed to.
    const claimed = await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);
    expect(claimed.body).toHaveLength(1);
  });

  /**
   * The other half of the same defect: registration upserts by hostname, so
   * announcing an existing machine's hostname used to return that machine's
   * id — a takeover in one call, no credential of its own needed.
   */
  it("refuses to re-register a machine registered by somebody else", async () => {
    const ctx = await setup();

    await ctx
      .asAgent(request(http).post("/runtime/workers"))
      .send({
        hostname: "workshop-01",
        architecture: "x86_64",
        operatingSystem: "linux",
      })
      .expect(403);
  });

  it("refuses an order for a machine that does not serve the workspace", async () => {
    const ctx = await setup();

    await ctx
      .auth(request(http).post(`${ctx.base}/commands`))
      .send({ workerId: ctx.workerId, type: "ExecuteTask" })
      .expect(403);
  });

  /** §17.7's third resource, and the observation 0.3.3 records. */
  it("names the stuck commands rather than counting them", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`${ctx.base}/workers`))
      .send({ workerId: ctx.workerId })
      .expect(200);
    await ctx
      .auth(request(http).post(`${ctx.base}/commands`))
      .send({ workerId: ctx.workerId, type: "ExecuteTask" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);

    await prisma.runtimeCommand.updateMany({
      data: { claimedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const health = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/health`))
      .expect(200);
    const commands = health.body.signals.find(
      (s: { probe: string }) => s.probe === "runtime_commands",
    );
    expect(commands.count).toBe(1);
    // Which one, and since when — never just how many (§17.8).
    expect(commands.resources[0].type).toBe("command:ExecuteTask");
    expect(commands.resources[0].degradedForMs).toBeGreaterThan(0);
  });

  it("requires authentication", async () => {
    await request(http).get("/runtime/providers").expect(401);
    await request(http)
      .post("/runtime/workers")
      .send({ hostname: "x", architecture: "y", operatingSystem: "z" })
      .expect(401);
  });

  /**
   * §7.4, §9 — a machine that says it can run something is the reason that
   * something exists in the catalogue.
   *
   * This is the defect that made the whole product look dead. A provider
   * profile was only ever created by an operator calling
   * `POST /runtime/providers/:provider/availability` by hand, and neither the
   * console nor the daemon ever called it. So the catalogue stayed empty
   * forever, and auto-dispatch — which picks the first AVAILABLE provider —
   * found none and returned. Silently, into a log nobody was reading.
   *
   * The visible result: a workspace with automation on, a machine online, an
   * agent assigned, a task READY, and zero commands. "0 provider" on the
   * machines screen was the only clue, and it read like a display bug.
   */
  it("registers a provider for each capability a machine announces", async () => {
    const ctx = await setup();

    await ctx
      .auth(request(http).post("/runtime/workers"))
      .send({
        hostname: "salsa-013",
        architecture: "x86_64",
        operatingSystem: "linux",
        capabilities: ["docker", "node"],
        // Capabilities and providers are different lists, and this test is
        // the reason: cataloguing the former would put "docker" in front of
        // auto-dispatch, which picks the first available provider.
        providers: ["claude", "codex"],
      })
      .expect(201);

    const providers = await ctx.auth(request(http).get("/runtime/providers")).expect(200);
    const listed = providers.body as {
      provider: string;
      effectiveAvailable: boolean;
    }[];

    expect(listed.map((entry) => entry.provider).sort()).toEqual(["claude", "codex"]);
    /**
     * Available on arrival: the machine that just said it can run this is the
     * evidence. Anything else would need a second manual act to undo the
     * first, which is the state these tests exist to prevent.
     */
    expect(listed.every((entry) => entry.effectiveAvailable)).toBe(true);
  });

  /**
   * An operator who disabled a provider meant it. A machine reconnecting —
   * which happens on every restart — must not quietly undo that.
   */
  it("never re-enables a provider an operator turned off", async () => {
    const ctx = await setup();
    const announce = () =>
      ctx
        .auth(request(http).post("/runtime/workers"))
        .send({
          hostname: "salsa-013",
          architecture: "x86_64",
          operatingSystem: "linux",
          capabilities: ["docker"],
          providers: ["claude"],
        })
        .expect(201);

    await announce();
    await ctx
      .auth(request(http).post("/runtime/providers/claude/availability"))
      .send({ action: "DISABLE" })
      .expect(200);
    await announce();

    const providers = await ctx.auth(request(http).get("/runtime/providers")).expect(200);
    const listed = providers.body as { effectiveAvailable: boolean }[];
    expect(listed[0]?.effectiveAvailable).toBe(false);
  });

});
