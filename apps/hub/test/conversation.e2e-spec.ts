import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §10.18a-b — the two gaps the OpenClaw study named in this system's
 * collaboration protocol.
 *
 * Before this, Spline had assignment: telling somebody to do something.
 * Nobody waited for an answer, nothing linked a result to whoever needed it,
 * and two actors replying to each other had no bound at all — `ReactionDepth`
 * cannot see a loop whose every turn is a separate request.
 */
describe("Conversation (e2e)", () => {
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
    const organizationId = registered.body.organizationId as string;
    const auth = (r: request.Test) =>
      r.set("Authorization", `Bearer ${logged.body.accessToken}`);
    const ws = await auth(request(http).post("/workspaces"))
      .send({ organizationId, name: "Core" })
      .expect(201);
    const workspaceId = ws.body.workspaceId as string;

    // Two agents, so a conversation has two genuine sides (§13.7's lesson:
    // the same actor on both sides proves nothing).
    const tokens: Record<string, string> = {};
    for (const agentId of ["a-asker", "a-answerer", "a-stranger"]) {
      const issued = await app.get(IssueActorCredentialUseCase).execute({
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
    const as = (agentId: string) => (r: request.Test) =>
      r.set("Authorization", `Bearer ${tokens[agentId]}`);

    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["ok"] })
      .expect(201);

    return {
      auth,
      as,
      workspaceId,
      goalId: goal.body.goalId as string,
      userId: registered.body.userId as string,
      base: `/workspaces/${workspaceId}/threads`,
    };
  }

  it("opens a thread, and the asking counts as the first turn", async () => {
    const ctx = await setup();

    const thread = await ctx
      .as("a-asker")(request(http).post(ctx.base))
      .send({
        participantType: "AGENT",
        participantId: "a-answerer",
        subject: "Can you review the migration?",
      })
      .expect(201);

    const read = await ctx
      .as("a-asker")(request(http).get(`${ctx.base}/${thread.body.threadId}`))
      .expect(200);
    expect(read.body.turns).toHaveLength(1);
    expect(read.body.turnsLeft).toBe(4);
    expect(read.body.status).toBe("OPEN");
  });

  /** §10.18c's hook: a thread has two sides, and membership is not one of them. */
  it("refuses a turn from a member who is not in the thread", async () => {
    const ctx = await setup();
    const thread = await ctx
      .as("a-asker")(request(http).post(ctx.base))
      .send({ participantType: "AGENT", participantId: "a-answerer", subject: "Hi" })
      .expect(201);

    await ctx
      .as("a-stranger")(request(http).post(`${ctx.base}/${thread.body.threadId}/turns`))
      .send({ message: "Actually…" })
      .expect(403);
  });

  /**
   * §10.18b — the bound. Two actors replying to each other, each in its own
   * request, loop forever without one.
   */
  describe("the turn budget", () => {
    it("stops the exchange when the turns run out, and says why", async () => {
      const ctx = await setup();
      const thread = await ctx
        .as("a-asker")(request(http).post(ctx.base))
        .send({
          participantType: "AGENT",
          participantId: "a-answerer",
          subject: "Ping",
          turnBudget: 3,
        })
        .expect(201);
      const at = `${ctx.base}/${thread.body.threadId}/turns`;

      await ctx.as("a-answerer")(request(http).post(at)).send({ message: "pong" }).expect(200);
      const last = await ctx
        .as("a-asker")(request(http).post(at))
        .send({ message: "ping" })
        .expect(200);
      expect(last.body.turnsLeft).toBe(0);
      expect(last.body.status).toBe("EXHAUSTED");

      const over = await ctx
        .as("a-answerer")(request(http).post(at))
        .send({ message: "pong" })
        .expect(409);
      expect(over.body.message).toMatch(/looping|turns/i);
    });

    it("refuses a budget larger than the ceiling, rather than trimming it", async () => {
      const ctx = await setup();

      await ctx
        .as("a-asker")(request(http).post(ctx.base))
        .send({
          participantType: "AGENT",
          participantId: "a-answerer",
          subject: "Forever",
          turnBudget: 50,
        })
        .expect(400);
    });
  });

  /**
   * §10.18b's other half. Without it, a finished conversation and a truncated
   * one are the same event, and nobody can tell which happened.
   */
  it("lets a participant say they have nothing to add", async () => {
    const ctx = await setup();
    const thread = await ctx
      .as("a-asker")(request(http).post(ctx.base))
      .send({ participantType: "AGENT", participantId: "a-answerer", subject: "Hi" })
      .expect(201);
    const at = `${ctx.base}/${thread.body.threadId}/turns`;

    // No message at all is the terminator.
    const closed = await ctx.as("a-answerer")(request(http).post(at)).send({}).expect(200);
    expect(closed.body.status).toBe("CLOSED");

    // And CLOSED is distinguishable from EXHAUSTED, which is the point.
    await ctx.as("a-asker")(request(http).post(at)).send({ message: "wait" }).expect(409);
  });

  /**
   * §10.18a — delegation with a return path. This is the whole reason the
   * module exists: the asker learns what came of the work without polling.
   */
  describe("delegating and being told the outcome", () => {
    async function delegated(ctx: Awaited<ReturnType<typeof setup>>) {
      const task = await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
        .send({
          goalId: ctx.goalId,
          title: "Review the migration",
          acceptanceCriteria: ["reviewed"],
          assigneeType: "AGENT",
          assigneeId: "a-answerer",
        })
        .expect(201);
      const thread = await ctx
        .as("a-asker")(request(http).post(ctx.base))
        .send({
          participantType: "AGENT",
          participantId: "a-answerer",
          subject: "Please review this",
          taskId: task.body.taskId,
        })
        .expect(201);
      return { taskId: task.body.taskId as string, threadId: thread.body.threadId as string };
    }

    it("is marked as waiting while the work is unfinished", async () => {
      const ctx = await setup();
      const { threadId } = await delegated(ctx);

      const read = await ctx
        .as("a-asker")(request(http).get(`${ctx.base}/${threadId}`))
        .expect(200);
      expect(read.body.awaiting).toBe(true);
      expect(read.body.outcome).toBeNull();
    });

    /**
     * The announcement back. Nobody asked the thread for anything: finishing
     * the TASK is what answers it.
     */
    /**
     * CANCELLED rather than COMPLETED, and the reason is worth knowing:
     * completing a task requires proof (§11 — "les agents ne déclarent jamais
     * eux-mêmes une réussite"), so it has its own route and its own
     * validation. Cancelling settles the task just as truly, and keeps this
     * test about the announcement rather than about the validation engine.
     */
    it("answers the thread by itself when the task settles", async () => {
      const ctx = await setup();
      const { taskId, threadId } = await delegated(ctx);

      for (const status of ["READY", "ASSIGNED", "RUNNING", "CANCELLED"]) {
        await ctx
          .auth(
            request(http).post(`/workspaces/${ctx.workspaceId}/tasks/${taskId}/status`),
          )
          .send({ status })
          .expect(200);
      }

      const read = await ctx
        .as("a-asker")(request(http).get(`${ctx.base}/${threadId}`))
        .expect(200);
      expect(read.body.status).toBe("ANSWERED");
      expect(read.body.awaiting).toBe(false);
      expect(read.body.outcome).toMatchObject({ taskId, status: "CANCELLED" });
    });

    /**
     * A failure is still an answer — and it is the outcome an asker most
     * needs to hear. A listener that only heard about success would leave
     * them waiting forever on precisely the wrong case.
     */
    it("answers the thread when the task fails, not only when it succeeds", async () => {
      const ctx = await setup();
      const { taskId, threadId } = await delegated(ctx);

      for (const status of ["READY", "ASSIGNED", "RUNNING", "FAILED"]) {
        await ctx
          .auth(
            request(http).post(`/workspaces/${ctx.workspaceId}/tasks/${taskId}/status`),
          )
          .send({ status })
          .expect(200);
      }

      const read = await ctx
        .as("a-asker")(request(http).get(`${ctx.base}/${threadId}`))
        .expect(200);
      expect(read.body.status).toBe("ANSWERED");
      expect(read.body.outcome).toMatchObject({ status: "FAILED" });
    });

    it("leaves a thread that delegated nothing alone", async () => {
      const ctx = await setup();
      const thread = await ctx
        .as("a-asker")(request(http).post(ctx.base))
        .send({ participantType: "AGENT", participantId: "a-answerer", subject: "Chat" })
        .expect(201);

      await ctx
        .as("a-answerer")(request(http).post(`${ctx.base}/${thread.body.threadId}/outcome`))
        .send({ outcome: { status: "COMPLETED" } })
        .expect(409);
    });
  });

  it("shows an actor only the threads it is part of", async () => {
    const ctx = await setup();
    await ctx
      .as("a-asker")(request(http).post(ctx.base))
      .send({ participantType: "AGENT", participantId: "a-answerer", subject: "Hi" })
      .expect(201);

    expect(
      (await ctx.as("a-answerer")(request(http).get(`${ctx.base}/mine`)).expect(200)).body,
    ).toHaveLength(1);
    expect(
      (await ctx.as("a-stranger")(request(http).get(`${ctx.base}/mine`)).expect(200)).body,
    ).toEqual([]);
  });
});
