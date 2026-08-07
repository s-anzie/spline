import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { AbandonSilentRunsUseCase } from "../src/modules/execution/application/abandon-silent-runs.use-case";
import { resetDatabase } from "./setup/reset-database";

/**
 * §4.12 — a session is the living instance of an agent, and until now none
 * ever existed.
 *
 * The domain was complete: states, transitions, heartbeat, staleness, a crash
 * event. Nothing created one. So the machines screen answered "0 sessions"
 * while two agents were demonstrably working, there was no way to know how
 * many instances of one agent were live — and therefore no way to cap them —
 * and a run that died left nothing behind saying an agent had died with it.
 *
 * A run answers "what happened to this task". A session answers "what is this
 * AGENT doing, right now, and on which machine". They are different
 * questions, which is why the run ledger could not stand in for this.
 */
describe("An agent's session follows its work (e2e)", () => {
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
      .send({ email: "o@example.com", password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "o@example.com", password: "a-strong-password" })
      .expect(200);
    const token = (logged.body as { accessToken: string }).accessToken;
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const organizationId = registered.body.organizationId as string;

    const workspaceId = (
      await auth(request(http).post("/workspaces"))
        .send({ organizationId, name: "W" })
        .expect(201)
    ).body.workspaceId as string;

    const issued = await app
      .get(IssueActorCredentialUseCase)
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId, displayName: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    const workerId = (
      await auth(request(http).post("/runtime/workers"))
        .send({
          hostname: "box-1",
          architecture: "x86_64",
          operatingSystem: "linux",
          providers: ["claude"],
        })
        .expect(201)
    ).body.workerId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/runtime/workers`))
      .send({ workerId })
      .expect(200);

    const goalId = (
      await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
        .send({ title: "G", successCriteria: ["c"] })
        .expect(201)
    ).body.goalId as string;
    const taskId = (
      await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
        .send({
          goalId,
          title: "T",
          acceptanceCriteria: ["c"],
          assigneeType: "AGENT",
          assigneeId: "a-1",
          start: true,
        })
        .expect(201)
    ).body.taskId as string;

    return {
      auth,
      workspaceId,
      workerId,
      goalId,
      taskId,
      agentToken: issued.isSuccess ? issued.value.token : "",
    };
  }

  it("opens a session naming the agent, the machine and the provider", async () => {
    const ctx = await setup();

    const dispatched = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);

    const sessions = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/runtime/sessions`))
      .expect(200);
    const live = sessions.body as {
      id: string;
      agent: { type: string; id: string };
      workerId: string;
      provider: string;
      taskId: string | null;
      status: string;
    }[];

    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({
      agent: { type: "AGENT", id: "a-1" },
      workerId: (dispatched.body as { workerId: string }).workerId,
      provider: "claude",
      taskId: ctx.taskId,
      status: "STARTING",
    });
  });

  it("runs when the machine takes the order, and stops when it reports", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);

    const claimed = await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/claim`,
        ),
      )
      .send({ max: 1 })
      .expect(200);
    const commandId = (claimed.body as { id: string }[])[0]?.id;
    expect(commandId).toBeTruthy();

    const running = await prisma.agentSession.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(running?.status).toBe("RUNNING");

    await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/${commandId}/report`,
        ),
      )
      .send({ outcome: "COMPLETED", result: {} })
      .expect(200);

    const stopped = await prisma.agentSession.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(stopped?.status).toBe("STOPPED");
    expect(stopped?.endedAt).not.toBeNull();
  });

  /**
   * §9.13, §17.9 — the path where NOBODY reports.
   *
   * The machine that held the order is exactly the thing that stopped
   * answering, so the ending can only come from the sweep that buries silent
   * runs. Without this a machine that was unplugged left sessions saying
   * RUNNING forever — worse than saying nothing, because a ceiling counts
   * against them and the screen tells an operator an agent is working when
   * its computer has been off for a day.
   */
  it("ends the session when its run is buried for silence", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({ max: 1 })
      .expect(200);

    // The machine goes quiet. Aged in the database rather than by waiting an
    // hour, which is the only honest way to test a timeout.
    const longAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await prisma.run.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { startedAt: longAgo },
    });

    await app.get(AbandonSilentRunsUseCase).execute({ workspaceId: ctx.workspaceId });

    const session = await prisma.agentSession.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(session?.status).toBe("CRASHED");
    expect(session?.endReason).toContain("no sign of life");
  });

  /**
   * §17.9 — a run that failed left an agent that, as far as anything could
   * tell, was still working. "When did the session fail" had no answer.
   */
  it("crashes the session when the machine reports a failure", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    const claimed = await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/claim`,
        ),
      )
      .send({ max: 1 })
      .expect(200);
    const commandId = (claimed.body as { id: string }[])[0]?.id;

    await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/${commandId}/report`,
        ),
      )
      .send({ outcome: "FAILED", failureReason: "the CLI exited 1" })
      .expect(200);

    const crashed = await prisma.agentSession.findFirst({
      where: { workspaceId: ctx.workspaceId },
    });
    expect(crashed?.status).toBe("CRASHED");
    expect(crashed?.endReason).toContain("the CLI exited 1");
  });

  /**
   * §4.12, §17.7 — the ceiling that only became askable once sessions existed.
   *
   * `concurrentRuns` protects the machine and the wallet. This one protects
   * the WORK: three instances of the same agent in the same checkout are
   * three agents queueing on each other's locks, and what they lose to
   * contention is more than the parallelism wins. One at a time by default.
   */
  it("refuses a second instance of an agent that is already working", async () => {
    const ctx = await setup();

    const second = (
      await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
        .send({
          goalId: ctx.goalId,
          title: "Another",
          acceptanceCriteria: ["c"],
          assigneeType: "AGENT",
          assigneeId: "a-1",
          start: true,
        })
        .expect(201)
    ).body.taskId as string;

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);

    // The same agent, a different task, while the first instance is live.
    const refused = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: second, provider: "claude" })
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("already");

    // Once the first instance ends, the second may go.
    await prisma.agentSession.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { status: "STOPPED", endedAt: new Date() },
    });
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: second, provider: "claude" })
      .expect(201);
  });

  /** An operator who raises it means it. */
  it("allows as many instances as the workspace was configured for", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).patch(`/workspaces/${ctx.workspaceId}`))
      .send({ settings: { automation: { sessionsPerAgent: 2 } } })
      .expect(200);

    const second = (
      await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
        .send({
          goalId: ctx.goalId,
          title: "Another",
          acceptanceCriteria: ["c"],
          assigneeType: "AGENT",
          assigneeId: "a-1",
          start: true,
        })
        .expect(201)
    ).body.taskId as string;

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: second, provider: "claude" })
      .expect(201);
  });


  /**
   * §4.12 — `WAITING` existed in the state machine and nothing ever reached
   * it, so a session that was blocked on a person looked exactly like one
   * mid-edit. Both said RUNNING.
   *
   * The two things an agent waits on are the two it cannot resolve itself:
   * proof it is not allowed to grant (§10.9 — it never decides its own work
   * is done) and an obstacle it reported (§10.8). Both are already facts on
   * the journal; nothing new has to be invented to know.
   */
  it("waits when its agent asks for proof, and works again once decided", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({ max: 1 })
      .expect(200);

    const asked = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}/validations`))
      .send({ validations: [{ type: "human_review", mandatory: true }] })
      .expect(201);
    const validationId = (asked.body as { validationIds: string[] }).validationIds[0];

    expect(
      (await prisma.agentSession.findFirst({ where: { workspaceId: ctx.workspaceId } }))
        ?.status,
    ).toBe("WAITING");

    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "START" })
      .expect(200);
    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "SUCCEEDED" })
      .expect(200);

    expect(
      (await prisma.agentSession.findFirst({ where: { workspaceId: ctx.workspaceId } }))
        ?.status,
    ).toBe("RUNNING");
  });

  /** The other thing an agent cannot resolve on its own. */
  it("waits when its agent reports a blocker, and works again once cleared", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({ max: 1 })
      .expect(200);

    const reported = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}/blockers`))
      .send({ type: "TECHNICAL", description: "the API key is missing" })
      .expect(201);
    const blockerId = (reported.body as { blockerId: string }).blockerId;

    expect(
      (await prisma.agentSession.findFirst({ where: { workspaceId: ctx.workspaceId } }))
        ?.status,
    ).toBe("WAITING");

    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}/blockers/${blockerId}/resolve`,
        ),
      )
      .send({ resolution: "the key was added" })
      .expect(200);

    expect(
      (await prisma.agentSession.findFirst({ where: { workspaceId: ctx.workspaceId } }))
        ?.status,
    ).toBe("RUNNING");
  });


  /**
   * §6.6, §9.13 — ONE mechanism for one question.
   *
   * A session carried its own `lastHeartbeatAt` and an `isStaleAt`, and the
   * machine never sent a session heartbeat: the field was set once, at
   * creation, and never again. So the sessions probe declared every session
   * older than its threshold silent — including one that had been working
   * happily for an hour. The workspace's health screen showed a standing
   * warning that meant nothing, which is worse than no warning at all,
   * because it teaches a reader to ignore the row.
   *
   * A machine reports against a RUN. That is the signal of life, it is the
   * one the sweep already judges, and a session now ends with its run. So
   * there is nothing a second timer could tell anybody — and what the probe
   * watches instead is the invariant that makes that true.
   */
  it("does not call a working session silent", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({ max: 1 })
      .expect(200);

    // An hour of honest work. The machine is reporting against the run, which
    // is the only place a machine ever reports.
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.agentSession.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { startedAt: anHourAgo, lastHeartbeatAt: anHourAgo },
    });

    const health = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/health`))
      .expect(200);
    const sessions = (health.body as { signals: { probe: string; level: string }[] })
      .signals.find((signal) => signal.probe === "sessions");
    expect(sessions?.level).toBe("HEALTHY");
  });

  /** What the probe watches instead: an instance outliving the work it was for. */
  it("complains about a session still live after its run has ended", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({ max: 1 })
      .expect(200);

    // The run ends behind the session's back — which is exactly the state the
    // listener exists to prevent, so a probe that catches it is a check on
    // that listener rather than a second way of asking the same thing.
    await prisma.run.updateMany({
      where: { workspaceId: ctx.workspaceId },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });

    const health = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/health`))
      .expect(200);
    const sessions = (health.body as { signals: { probe: string; level: string }[] })
      .signals.find((signal) => signal.probe === "sessions");
    expect(sessions?.level).not.toBe("HEALTHY");
  });


  /**
   * §4.12 — the ceiling has to hold where orders are HANDED OUT, not only
   * where they are created.
   *
   * Refusing at dispatch stops the ordinary path and nothing else. An order
   * enqueued directly (`POST /runtime/commands` — a real route, meant for an
   * operator) never passes that check, and two orders dispatched while the
   * ceiling still allowed both sit PENDING until a machine takes them —
   * together. The claim is the last moment before an agent actually starts,
   * and the hub owns it, so that is where the ceiling has to be true.
   *
   * Skipped rather than failed: the order is not wrong, it is not its turn.
   * It stays PENDING and the next claim, after something finishes, takes it.
   */
  it("does not hand out a second order for an agent already at its ceiling", async () => {
    const ctx = await setup();

    const second = (
      await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
        .send({
          goalId: ctx.goalId,
          title: "Another",
          acceptanceCriteria: ["c"],
          assigneeType: "AGENT",
          assigneeId: "a-1",
          start: true,
        })
        .expect(201)
    ).body.taskId as string;

    /**
     * Two orders reach the queue while the ceiling still allows both, and
     * then the ceiling is lowered — which is the ordinary shape of the
     * problem: a queue outlives the configuration that let it fill.
     */
    await ctx
      .auth(request(http).patch(`/workspaces/${ctx.workspaceId}`))
      .send({ settings: { automation: { sessionsPerAgent: 2 } } })
      .expect(200);
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: second, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).patch(`/workspaces/${ctx.workspaceId}`))
      .send({ settings: { automation: { sessionsPerAgent: 1 } } })
      .expect(200);

    // Even asking for both at once, only one may go.
    const claimed = await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({ max: 10 })
      .expect(200);
    expect((claimed.body as unknown[]).length).toBe(1);

    const running = await prisma.agentSession.count({
      where: { workspaceId: ctx.workspaceId, status: "RUNNING" },
    });
    expect(running).toBe(1);
  });

});
