import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §4.7-4.8, §9.12-9.13 — the execution history of a task.
 *
 * What it exists for: "why does this task keep failing" being a question with
 * an answer. Three failures leave three runs, each carrying what it cost and
 * which provider carried it.
 */
describe("Execution (e2e)", () => {
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
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const userId = registered.body.userId as string;

    const workspace = await auth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "Core" })
      .expect(201);
    const workspaceId = workspace.body.workspaceId as string;
    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship it", successCriteria: ["it ships"] })
      .expect(201);
    const task = await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Do the thing",
        acceptanceCriteria: ["it works"],
        assigneeType: "HUMAN",
        assigneeId: userId,
      })
      .expect(201);

    const taskId = task.body.taskId as string;
    /**
     * Walks a task to a status through its own routes rather than the
     * database: a fixture that writes a status directly would pass while the
     * transitions it skipped were broken.
     */
    const moveTaskTo = async (...statuses: string[]) => {
      for (const status of statuses) {
        await auth(
          request(http).post(`/workspaces/${workspaceId}/tasks/${taskId}/status`),
        )
          .send({ status })
          .expect(200);
      }
    };

    return {
      auth,
      workspaceId,
      taskId,
      moveTaskTo,
      base: `/workspaces/${workspaceId}/runs`,
    };
  }

  it("records what ran, on which provider, and what it cost", async () => {
    const ctx = await setup();

    const run = await ctx
      .auth(request(http).post(ctx.base))
      .send({ taskId: ctx.taskId })
      .expect(201);
    await ctx
      .auth(request(http).post(`${ctx.base}/${run.body.runId}/attempts`))
      .send({ workerId: "worker-1", provider: "claude", model: "opus" })
      .expect(201);
    await ctx
      .auth(request(http).post(`${ctx.base}/${run.body.runId}/attempts/finish`))
      .send({
        outcome: "COMPLETED",
        tokenUsage: { input: 1200, output: 340 },
        cost: 0.42,
        runStatus: "VALIDATING",
      })
      .expect(200);

    const read = await ctx
      .auth(request(http).get(`${ctx.base}/${run.body.runId}`))
      .expect(200);
    expect(read.body.status).toBe("VALIDATING");
    expect(read.body.attempts).toHaveLength(1);
    expect(read.body.attempts[0]).toMatchObject({
      number: 1,
      provider: "claude",
      cost: 0.42,
      outcome: "COMPLETED",
    });
    expect(read.body.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  /** §9.12 — "Chaque Retry crée un nouveau Run. L'historique est conservé." */
  it("keeps every run of a task, numbered in order", async () => {
    const ctx = await setup();

    const first = await ctx
      .auth(request(http).post(ctx.base))
      .send({ taskId: ctx.taskId })
      .expect(201);
    await ctx
      .auth(request(http).post(`${ctx.base}/${first.body.runId}/attempts`))
      .send({ workerId: "worker-1", provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`${ctx.base}/${first.body.runId}/attempts/finish`))
      .send({ outcome: "FAILED", runStatus: "FAILED", failureReason: "the build broke" })
      .expect(200);

    /**
     * The RUN failed; the TASK has not. Nothing here moves a task on its
     * run's behalf, and that is deliberate — §9.13 leaves "échec ou retry" to
     * the scheduler, and a module that decided it would be deciding policy it
     * does not own. So the task is walked to FAILED explicitly.
     */
    await ctx.moveTaskTo("READY", "ASSIGNED", "RUNNING", "FAILED");

    const retried = await ctx
      .auth(request(http).post(`${ctx.base}/retry`))
      .send({ taskId: ctx.taskId })
      .expect(201);

    const history = await ctx
      .auth(request(http).get(`${ctx.base}?taskId=${ctx.taskId}`))
      .expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body.map((run: { attemptNumber: number }) => run.attemptNumber).sort()).toEqual([
      1, 2,
    ]);
    // The first run is still there, with why it failed.
    const failed = history.body.find((run: { runId: string }) => run.runId === first.body.runId);
    expect(failed.failureReason).toBe("the build broke");
    expect(retried.body.runId).not.toBe(first.body.runId);
  });

  it("refuses to retry a task whose state does not allow it, and says what does", async () => {
    const ctx = await setup();

    // The task is still PLANNED: nothing has failed, so there is nothing to
    // retry.
    const refused = await ctx
      .auth(request(http).post(`${ctx.base}/retry`))
      .send({ taskId: ctx.taskId })
      .expect(409);

    expect(refused.body.message).toContain("PLANNED");
    // §20.6 — the refusal names what WOULD work.
    expect(refused.body.message).toMatch(/READY|BLOCKED|CANCELLED/);
  });

  /**
   * §4.8's resume invariant, from a real failure (0.3.11): a Claude session
   * cannot resume a Codex thread.
   */
  describe("resuming requires the provider that produced the attempt", () => {
    async function ranOn(provider: string) {
      const ctx = await setup();
      const run = await ctx
        .auth(request(http).post(ctx.base))
        .send({ taskId: ctx.taskId })
        .expect(201);
      await ctx
        .auth(request(http).post(`${ctx.base}/${run.body.runId}/attempts`))
        .send({ workerId: "worker-1", provider })
        .expect(201);
      await ctx
        .auth(request(http).post(`${ctx.base}/${run.body.runId}/attempts/finish`))
        .send({ outcome: "FAILED" })
        .expect(200);
      return { ctx, runId: run.body.runId as string };
    }

    it("allows the same provider", async () => {
      const { ctx, runId } = await ranOn("claude");

      await ctx
        .auth(request(http).get(`${ctx.base}/${runId}/resumable/claude`))
        .expect(200);
    });

    it("refuses a different one, naming both", async () => {
      const { ctx, runId } = await ranOn("claude");

      const refused = await ctx
        .auth(request(http).get(`${ctx.base}/${runId}/resumable/codex`))
        .expect(409);

      expect(refused.body.message).toContain("claude");
      expect(refused.body.message).toContain("codex");
    });
  });

  /** §9.13 — a run that overran is failed, and its attempt is not left open. */
  it("fails a run that ran longer than the workspace allows, naming which", async () => {
    const ctx = await setup();
    const run = await ctx
      .auth(request(http).post(ctx.base))
      .send({ taskId: ctx.taskId })
      .expect(201);
    await ctx
      .auth(request(http).post(`${ctx.base}/${run.body.runId}/attempts`))
      .send({ workerId: "worker-1", provider: "claude" })
      .expect(201);

    // The floor on ttlMs is 1000ms, so the run has to genuinely be that old:
    // a shorter window would prove the sweep runs, not that it judges.
    await new Promise((done) => setTimeout(done, 1100));

    const swept = await ctx
      .auth(request(http).post(`${ctx.base}/sweep-overrun`))
      .send({ ttlMs: 1000 })
      .expect(200);

    // §17.8 — the names, never a bare count.
    expect(swept.body.failed).toEqual([run.body.runId]);

    const read = await ctx
      .auth(request(http).get(`${ctx.base}/${run.body.runId}`))
      .expect(200);
    expect(read.body.status).toBe("FAILED");
    // The attempt is closed as ABANDONED: an open measurement would be
    // counted as still running forever.
    expect(read.body.attempts[0].outcome).toBe("ABANDONED");
  });

  it("leaves a run that has not overrun alone", async () => {
    const ctx = await setup();
    const run = await ctx
      .auth(request(http).post(ctx.base))
      .send({ taskId: ctx.taskId })
      .expect(201);
    await ctx
      .auth(request(http).post(`${ctx.base}/${run.body.runId}/attempts`))
      .send({ workerId: "worker-1", provider: "claude" })
      .expect(201);

    const swept = await ctx
      .auth(request(http).post(`${ctx.base}/sweep-overrun`))
      .send({ ttlMs: 600_000 })
      .expect(200);

    expect(swept.body.failed).toEqual([]);
  });

  /** §4.2 — absolute isolation, checked on a module that carries no guard of its own. */
  it("does not show one workspace's runs to another", async () => {
    const mine = await setup();
    const run = await mine
      .auth(request(http).post(mine.base))
      .send({ taskId: mine.taskId })
      .expect(201);

    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "other@example.com", password: "a-strong-password", displayName: "X" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "other@example.com", password: "a-strong-password" })
      .expect(200);
    const otherAuth = (r: request.Test) =>
      r.set("Authorization", `Bearer ${logged.body.accessToken}`);
    const otherWorkspace = await otherAuth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "Theirs" })
      .expect(201);

    await otherAuth(
      request(http).get(
        `/workspaces/${otherWorkspace.body.workspaceId}/runs/${run.body.runId}`,
      ),
    ).expect(404);
  });
});

/**
 * §9.14 — "Une tâche critique peut interrompre une tâche moins prioritaire si
 * le Lease est récupérable et la reprise possible."
 *
 * Lives beside the execution suite because preemption is only meaningful once
 * runs exist: the two conditions §9.14 names are both answered by a run.
 */
describe("Preemption (e2e)", () => {
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

  async function workspace() {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "o@example.com", password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "o@example.com", password: "a-strong-password" })
      .expect(200);
    const token = logged.body.accessToken as string;
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const ws = await auth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "Core" })
      .expect(201);
    const workspaceId = ws.body.workspaceId as string;
    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["ok"] })
      .expect(201);

    /** A task walked all the way to RUNNING, with a run that has attempted. */
    const runningTask = async (title: string, priority: string, attempted = true) => {
      const task = await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
        .send({
          goalId: goal.body.goalId,
          title,
          acceptanceCriteria: ["ok"],
          assigneeType: "HUMAN",
          assigneeId: registered.body.userId,
          priority,
        })
        .expect(201);
      const taskId = task.body.taskId as string;
      for (const status of ["READY", "ASSIGNED", "RUNNING"]) {
        await auth(
          request(http).post(`/workspaces/${workspaceId}/tasks/${taskId}/status`),
        )
          .send({ status })
          .expect(200);
      }
      const run = await auth(request(http).post(`/workspaces/${workspaceId}/runs`))
        .send({ taskId })
        .expect(201);
      if (attempted) {
        await auth(
          request(http).post(
            `/workspaces/${workspaceId}/runs/${run.body.runId}/attempts`,
          ),
        )
          .send({ workerId: "worker-1", provider: "claude" })
          .expect(201);
      }
      return { taskId, runId: run.body.runId as string };
    };

    return { auth, workspaceId, runningTask, base: `/workspaces/${workspaceId}/schedule` };
  }

  it("interrupts a less urgent task and says which", async () => {
    const ctx = await workspace();
    const victim = await ctx.runningTask("Background chores", "BACKGROUND");

    const preempted = await ctx
      .auth(request(http).post(`${ctx.base}/preempt`))
      .send({ claimantTaskId: "t-urgent", claimantPriority: "CRITICAL" })
      .expect(200);

    // §17.8 — who, never just "one task".
    expect(preempted.body.preemptedTaskId).toBe(victim.taskId);

    /**
     * BLOCKED, not FAILED: a task carries where it stood when it got blocked,
     * so it resumes instead of restarting (§4.6). Failing it would turn
     * preemption into a retry from zero — the very thing §9.14's "reprise
     * possible" condition exists to avoid.
     */
    const task = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/tasks/${victim.taskId}`))
      .expect(200);
    expect(task.body.status).toBe("BLOCKED");

    // And its run is closed, with the attempt not left counting as in flight.
    const run = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/runs/${victim.runId}`))
      .expect(200);
    expect(run.body.status).toBe("FAILED");
    expect(run.body.attempts[0].outcome).toBe("ABANDONED");
  });

  it("takes the least urgent of several, by written precedence", async () => {
    const ctx = await workspace();
    await ctx.runningTask("Normal work", "NORMAL");
    const background = await ctx.runningTask("Background chores", "BACKGROUND");
    await ctx.runningTask("Low work", "LOW");

    const preempted = await ctx
      .auth(request(http).post(`${ctx.base}/preempt`))
      .send({ claimantTaskId: "t-urgent", claimantPriority: "CRITICAL" })
      .expect(200);

    expect(preempted.body.preemptedTaskId).toBe(background.taskId);
  });

  it("refuses to interrupt a task of equal priority, and says why", async () => {
    const ctx = await workspace();
    await ctx.runningTask("Also critical", "CRITICAL");

    const refused = await ctx
      .auth(request(http).post(`${ctx.base}/preempt`))
      .send({ claimantTaskId: "t-urgent", claimantPriority: "CRITICAL" })
      .expect(409);

    expect(refused.body.message).toContain("CRITICAL");
  });

  /** §9.14's "la reprise possible", refused when it is not. */
  it("leaves alone a task whose work could not be resumed", async () => {
    const ctx = await workspace();
    // A run that never attempted anything: there is nothing to resume, so
    // interrupting it would lose work with no record of what it was.
    await ctx.runningTask("Never attempted", "BACKGROUND", false);

    await ctx
      .auth(request(http).post(`${ctx.base}/preempt`))
      .send({ claimantTaskId: "t-urgent", claimantPriority: "CRITICAL" })
      .expect(409);
  });

  it("refuses when nothing is running at all", async () => {
    const ctx = await workspace();

    await ctx
      .auth(request(http).post(`${ctx.base}/preempt`))
      .send({ claimantTaskId: "t-urgent", claimantPriority: "CRITICAL" })
      .expect(409);
  });
});
