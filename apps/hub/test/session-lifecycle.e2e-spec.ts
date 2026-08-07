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

});
