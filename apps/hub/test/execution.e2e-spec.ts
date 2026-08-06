import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
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

/**
 * §9.16 — the periodic trigger, and the observation behind it (0.3.10): a
 * system that is entirely up to date goes quiet, and nothing reports that.
 */
describe("Check-ins (e2e)", () => {
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
    const auth = (r: request.Test) =>
      r.set("Authorization", `Bearer ${logged.body.accessToken}`);
    const ws = await auth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "Core" })
      .expect(201);
    const workspaceId = ws.body.workspaceId as string;
    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["ok"] })
      .expect(201);
    return {
      auth,
      workspaceId,
      goalId: goal.body.goalId as string,
      userId: registered.body.userId as string,
      base: `/workspaces/${workspaceId}/schedule`,
    };
  }

  it("names the owner as due when nothing has ever been assigned to them", async () => {
    const ctx = await setup();

    const due = await ctx
      .auth(request(http).get(`${ctx.base}/check-ins`))
      .expect(200);

    expect(due.body).toHaveLength(1);
    expect(due.body[0].actor.id).toBe(ctx.userId);
    expect(due.body[0].silentForMs).toBeNull();
    // §17.8 — the reason travels with the name.
    expect(due.body[0].reason).toMatch(/never/i);
  });

  it("stops naming them once they have something actionable", async () => {
    const ctx = await setup();
    const task = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
      .send({
        goalId: ctx.goalId,
        title: "Do it",
        acceptanceCriteria: ["ok"],
        assigneeType: "HUMAN",
        assigneeId: ctx.userId,
      })
      .expect(201);
    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/tasks/${task.body.taskId}/status`,
        ),
      )
      .send({ status: "READY" })
      .expect(200);

    const due = await ctx
      .auth(request(http).get(`${ctx.base}/check-ins`))
      .expect(200);

    expect(due.body).toEqual([]);
  });

  /**
   * The interval is an argument, not stored state: changing a workspace's
   * policy changes every answer at once rather than only future ones (§17.7).
   */
  it("answers against the checkpoint it was given", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
      .send({
        goalId: ctx.goalId,
        title: "Done long ago",
        acceptanceCriteria: ["ok"],
        assigneeType: "HUMAN",
        assigneeId: ctx.userId,
      })
      .expect(201);

    // The task was just created, so a long checkpoint says "not silent"...
    expect(
      (await ctx.auth(request(http).get(`${ctx.base}/check-ins?checkpointMs=3600000`)).expect(200))
        .body,
    ).toEqual([]);
    // ...and a one-minute one says the same, because it really was just now.
    expect(
      (await ctx.auth(request(http).get(`${ctx.base}/check-ins?checkpointMs=60000`)).expect(200))
        .body,
    ).toEqual([]);
  });

  /** An actor asking for its own next work learns the same thing. */
  it("tells an actor with nothing that it has gone quiet, not merely that it is empty", async () => {
    const ctx = await setup();

    const mine = await ctx.auth(request(http).get(`${ctx.base}/mine`)).expect(200);

    expect(mine.body.next).toBeNull();
    expect(mine.body.checkIn).not.toBeNull();
    expect(mine.body.checkIn.reason).toMatch(/never|nothing/i);
  });
});

/**
 * §6.8, §7.1 — the whole loop, from a task to an order a machine can run.
 *
 * This is the piece that was missing until last: everything else existed and
 * nothing connected it. What it proves is that dispatching a task produces an
 * order carrying a prompt, a run to record the attempt, and the NAMES of the
 * secrets the task needs — never their values.
 */
describe("Dispatching a task to an agent (e2e)", () => {
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

  async function ready() {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "o@example.com", password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "o@example.com", password: "a-strong-password" })
      .expect(200);
    const auth = (r: request.Test) =>
      r.set("Authorization", `Bearer ${logged.body.accessToken}`);
    const ws = await auth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "Core" })
      .expect(201);
    const workspaceId = ws.body.workspaceId as string;

    const worker = await auth(request(http).post("/runtime/workers"))
      .send({
        hostname: "workshop-01",
        architecture: "x86_64",
        operatingSystem: "linux",
        // Both, so the resume tests are about providers rather than about
        // capability matching — which has its own test below.
        capabilities: ["claude", "codex"],
      })
      .expect(201);
    const workerId = worker.body.workerId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/runtime/workers`))
      .send({ workerId })
      .expect(200);

    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Make the schedule read fast", successCriteria: ["it is fast"] })
      .expect(201);
    const task = await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Add the missing index",
        description: "The query on tasks.workspaceId is sequential.",
        acceptanceCriteria: ["the migration exists"],
        assigneeType: "HUMAN",
        assigneeId: registered.body.userId,
      })
      .expect(201);
    const taskId = task.body.taskId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/tasks/${taskId}/status`))
      .send({ status: "READY" })
      .expect(200);

    await auth(request(http).post(`/workspaces/${workspaceId}/secrets`))
      .send({ name: "ANTHROPIC_API_KEY", value: "sk-ant-the-credential" })
      .expect(200);

    return { auth, workspaceId, workerId, taskId };
  }

  it("turns a task into an order a machine can claim and run", async () => {
    const ctx = await ready();

    const dispatched = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({
        taskId: ctx.taskId,
        provider: "claude",
        secretNames: ["ANTHROPIC_API_KEY"],
      })
      .expect(201);

    // A machine was chosen by capability: nobody named one.
    expect(dispatched.body.workerId).toBe(ctx.workerId);
    expect(dispatched.body.runId).toEqual(expect.any(String));
    expect(dispatched.body.resumedSessionId).toBeNull();

    const claimed = await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);
    expect(claimed.body).toHaveLength(1);

    const payload = claimed.body[0].payload;
    expect(payload.provider).toBe("claude");
    expect(payload.runId).toBe(dispatched.body.runId);
    // The task's own words reached the agent...
    expect(payload.prompt).toContain("Add the missing index");
    // ...fenced as data, with the warning before them (§18.12).
    expect(payload.prompt).toContain("<<<SPLINE-TASK-DATA");
    expect(payload.prompt.indexOf("not instructions")).toBeLessThan(
      payload.prompt.indexOf("Add the missing index"),
    );
    // §18.4 — the NAME travels, never the value.
    expect(payload.secretNames).toEqual(["ANTHROPIC_API_KEY"]);
    expect(JSON.stringify(payload)).not.toContain("sk-ant-the-credential");
  });

  /**
   * §16 — an agent starts every task knowing nothing.
   *
   * Without the workspace's memory in the briefing it re-litigates a
   * convention that was settled last week, on every dispatch, and the memory
   * module is a diary nobody reads. With it — and INSIDE the fence, because
   * notes are written by agents and one that read a poisoned file could
   * otherwise leave instructions for everyone who comes after.
   */
  it("hands the agent what this workspace has already learned, as data", async () => {
    const ctx = await ready();

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/memory`))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "CONVENTION",
        title: "Migrations are never edited in place",
        content: "Write a new one; the old ones have run in production.",
      })
      .expect(201);

    const dispatched = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    expect(dispatched.body.runId).toEqual(expect.any(String));

    const claimed = await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);

    const prompt = claimed.body[0].payload.prompt as string;
    expect(prompt).toContain("Migrations are never edited in place");
    expect(prompt).toContain("the old ones have run in production");

    // Quarantined with the rest of the task's text, not above it.
    expect(prompt.indexOf("Migrations are never edited")).toBeGreaterThan(
      prompt.indexOf("<<<SPLINE-TASK-DATA"),
    );
    expect(prompt.indexOf("Migrations are never edited")).toBeLessThan(
      prompt.indexOf("SPLINE-TASK-DATA>>>"),
    );
  });

  /** §18.4 — and the machine holding the order can then obtain the value. */
  it("lets the machine that holds the order fetch its credentials", async () => {
    const ctx = await ready();
    const dispatched = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({
        taskId: ctx.taskId,
        provider: "claude",
        secretNames: ["ANTHROPIC_API_KEY"],
      })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);

    const secrets = await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/${dispatched.body.commandId}/secrets`,
        ),
      )
      .expect(200);

    expect(secrets.body).toEqual({ ANTHROPIC_API_KEY: "sk-ant-the-credential" });
  });

  /**
   * §4.8 — the report closes the attempt AND records the provider session.
   * Without that last part, `resumableBy()` says "yes, same provider" while
   * having nothing to resume.
   */
  it("records what the agent did, and the session it left behind", async () => {
    const ctx = await ready();
    const dispatched = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);

    /**
     * No manual attempt here on purpose. Claiming the order opens it — and
     * calling this route by hand is exactly what hid the gap a real run
     * found: the run stayed PENDING for its whole execution because nothing
     * ever opened an attempt.
     */
    await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/${dispatched.body.commandId}/report`,
        ),
      )
      .send({
        outcome: "COMPLETED",
        result: {
          finalText: "I added the index",
          providerSessionId: "sess-abc",
          cost: 0.03,
          tokenUsage: { input_tokens: 900 },
        },
      })
      .expect(200);

    const run = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/runs/${dispatched.body.runId}`))
      .expect(200);

    // §11 — VALIDATING, never COMPLETED: an agent never declares its own success.
    expect(run.body.status).toBe("VALIDATING");
    expect(run.body.attempts[0]).toMatchObject({
      outcome: "COMPLETED",
      cost: 0.03,
    });
    expect(run.body.attempts[0].providerSessionId).toBe("sess-abc");
  });

  /** §4.8 (0.3.11) — a second dispatch on the same provider resumes. */
  it("resumes the session on a second dispatch with the same provider", async () => {
    const ctx = await ready();
    const first = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);
    await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/${first.body.commandId}/report`,
        ),
      )
      .send({ outcome: "COMPLETED", result: { providerSessionId: "sess-abc" } })
      .expect(200);

    const second = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);

    expect(second.body.resumedSessionId).toBe("sess-abc");
  });

  it("does not resume across providers, whatever the session says", async () => {
    const ctx = await ready();
    const first = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "claude" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
      .send({})
      .expect(200);
    await ctx
      .auth(
        request(http).post(
          `/runtime/workers/${ctx.workerId}/commands/${first.body.commandId}/report`,
        ),
      )
      .send({ outcome: "COMPLETED", result: { providerSessionId: "sess-abc" } })
      .expect(200);

    const second = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
      .send({ taskId: ctx.taskId, provider: "codex" })
      .expect(201);

    // A Claude session cannot be resumed by Codex (§4.8).
    expect(second.body.resumedSessionId).toBeNull();
  });

  describe("what it refuses", () => {
    it("refuses a task whose state does not allow it, naming what would", async () => {
      const ctx = await ready();
      await ctx
        .auth(
          request(http).post(
            `/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}/status`,
          ),
        )
        .send({ status: "CANCELLED" })
        .expect(200);

      const refused = await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
        .send({ taskId: ctx.taskId, provider: "claude" })
        .expect(409);

      expect(refused.body.message).toContain("CANCELLED");
    });

    /** §9.9 — the refusal names the capability, not just "no worker". */
    it("refuses when no attached machine can run the provider", async () => {
      const ctx = await ready();

      const refused = await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`))
        .send({ taskId: ctx.taskId, provider: "gemini" })
        .expect(409);

      // §9.9 — the refusal names the capability AND what it considered, so an
      // operator does not go looking at machines that are perfectly available.
      expect(refused.body.message).toContain("gemini");
      expect(refused.body.message).toContain("workshop-01");
    });

    /** §18.12 — no agent role may dispatch: that is the whole chain. */
    it("refuses an agent, because dispatching is a human act", async () => {
      const ctx = await ready();
      const organizationId = (
        await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })
      ).organizationId;
      const issued = await app.get(IssueActorCredentialUseCase).execute({
        actorType: "AGENT",
        actorId: "a-1",
        organizationId,
        displayName: "a-1",
      });
      await app.get(GrantWorkspaceMembershipUseCase).execute({
        actorType: "AGENT",
        actorId: "a-1",
        workspaceId: ctx.workspaceId,
        role: "AGENT_CONTRIBUTOR",
      });

      await request(http)
        .post(`/workspaces/${ctx.workspaceId}/runtime/dispatch`)
        .set("Authorization", `Bearer ${issued.value.token}`)
        .send({ taskId: ctx.taskId, provider: "claude" })
        .expect(403);
    });
  });
});

/**
 * §18.10, §10 — the credential an agent uses to call back mid-task.
 *
 * Every property here is about what a grant CANNOT do. The alternatives were
 * both bad: the machine's own credential would make the journal say the
 * machine did what the agent did, and a lasting agent credential would hand a
 * poisoned task the agent's whole authority for ever.
 */
describe("Task grants (e2e)", () => {
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

  async function dispatched(
    role: "AGENT_CONTRIBUTOR" | "AGENT_MANAGER" = "AGENT_CONTRIBUTOR",
  ) {
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

    await app.get(IssueActorCredentialUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      organizationId,
      displayName: "a-1",
    });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role,
    });

    const worker = await auth(request(http).post("/runtime/workers"))
      .send({
        hostname: "workshop-01",
        architecture: "x86_64",
        operatingSystem: "linux",
        capabilities: ["claude"],
      })
      .expect(201);
    const workerId = worker.body.workerId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/runtime/workers`))
      .send({ workerId })
      .expect(200);

    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["ok"] })
      .expect(201);
    const task = await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Do it",
        acceptanceCriteria: ["ok"],
        assigneeType: "AGENT",
        assigneeId: "a-1",
      })
      .expect(201);
    const taskId = task.body.taskId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/tasks/${taskId}/status`))
      .send({ status: "READY" })
      .expect(200);

    const command = await auth(
      request(http).post(`/workspaces/${workspaceId}/runtime/dispatch`),
    )
      .send({ taskId, provider: "claude" })
      .expect(201);
    await auth(request(http).post(`/runtime/workers/${workerId}/commands/claim`))
      .send({})
      .expect(200);

    return {
      auth,
      workspaceId,
      workerId,
      taskId,
      commandId: command.body.commandId as string,
      grantUrl: `/runtime/workers/${workerId}/commands/${command.body.commandId}/grant`,
    };
  }

  it("mints a credential that acts as the task's agent, not as the machine", async () => {
    const ctx = await dispatched();

    const grant = await ctx.auth(request(http).post(ctx.grantUrl)).expect(200);

    expect(grant.body.token).toMatch(/^grant_[^.]+\..+/);
    expect(grant.body.expiresAt).toEqual(expect.any(String));

    // Used, it IS the agent — the whole reason this exists.
    const me = await request(http)
      .get("/auth/me")
      .set("Authorization", `Bearer ${grant.body.token}`)
      .expect(200);
    expect(me.body.actorType).toBe("AGENT");
    expect(me.body.actorId).toBe("a-1");
  });

  /**
   * §18.10 — the intersection, and the property everything else rests on.
   * OpenClaw shipped a rotation path without it (CVE-2026-32922) and a
   * pairing scope could mint an admin one.
   */
  describe("the intersection", () => {
    /**
     * The observable direction today. Both agent roles that may hold a task
     * carry every protocol scope — a task cannot be assigned to an actor
     * without `execute_tasks` — so "role holds less than asked" cannot be
     * reached from here. What CAN be shown is the other side, and it is the
     * one that matters: an AGENT_MANAGER holds `manage_tasks` and
     * `manage_goals`, and the grant carries neither.
     */
    it("grants only the protocol's scopes, even to a role that holds more", async () => {
      const ctx = await dispatched("AGENT_MANAGER");

      const grant = await ctx.auth(request(http).post(ctx.grantUrl)).expect(200);

      expect(grant.body.scopes).toContain("read_workspace_state");
      expect(grant.body.scopes).toContain("execute_tasks");
      // Held by the role, absent from the grant.
      expect(grant.body.scopes).not.toContain("manage_tasks");
      expect(grant.body.scopes).not.toContain("manage_goals");
    });

    it("refuses a route the grant does not carry, naming what it does", async () => {
      const ctx = await dispatched("AGENT_MANAGER");
      const grant = await ctx.auth(request(http).post(ctx.grantUrl)).expect(200);

      // The agent's ROLE allows this; its grant does not.
      const refused = await request(http)
        .patch(`/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}`)
        .set("Authorization", `Bearer ${grant.body.token}`)
        .send({ title: "Renamed by a grant that may not" })
        .expect(403);

      expect(refused.body.message).toContain("does not carry");
      // §20.6 — the refusal says what would have worked.
      expect(refused.body.message).toContain("read_workspace_state");
    });

    it("allows what it does carry", async () => {
      const ctx = await dispatched();
      const grant = await ctx.auth(request(http).post(ctx.grantUrl)).expect(200);

      await request(http)
        .get(`/workspaces/${ctx.workspaceId}/tasks`)
        .set("Authorization", `Bearer ${grant.body.token}`)
        .expect(200);
    });

    /** A credential minted for one workspace must not work in another. */
    it("refuses another workspace outright", async () => {
      const ctx = await dispatched();
      const grant = await ctx.auth(request(http).post(ctx.grantUrl)).expect(200);
      const other = await ctx
        .auth(request(http).post("/workspaces"))
        .send({
          organizationId: (
            await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })
          ).organizationId,
          name: "Other",
        })
        .expect(201);

      await request(http)
        .get(`/workspaces/${other.body.workspaceId}/tasks`)
        .set("Authorization", `Bearer ${grant.body.token}`)
        .expect(403);
    });
  });

  describe("who may ask for one", () => {
    it("refuses a machine that does not hold the order", async () => {
      const ctx = await dispatched();
      // Report it finished, so the claim no longer stands... actually the
      // simplest proof: a second, unclaimed order.
      const second = await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/commands`))
        .send({ workerId: ctx.workerId, type: "ExecuteTask", payload: { taskId: ctx.taskId } })
        .expect(201);

      await ctx
        .auth(
          request(http).post(
            `/runtime/workers/${ctx.workerId}/commands/${second.body.commandId}/grant`,
          ),
        )
        .expect(403);
    });

    it("refuses an order that belongs to no task", async () => {
      const ctx = await dispatched();
      const loose = await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/runtime/commands`))
        .send({ workerId: ctx.workerId, type: "ExecuteTask", payload: {} })
        .expect(201);
      await ctx
        .auth(request(http).post(`/runtime/workers/${ctx.workerId}/commands/claim`))
        .send({})
        .expect(200);

      await ctx
        .auth(
          request(http).post(
            `/runtime/workers/${ctx.workerId}/commands/${loose.body.commandId}/grant`,
          ),
        )
        .expect(400);
    });
  });

  /** Only the hash is kept: a token in the table is a token in every backup. */
  it("stores no readable token", async () => {
    const ctx = await dispatched();
    const grant = await ctx.auth(request(http).post(ctx.grantUrl)).expect(200);

    const row = await prisma.taskGrant.findFirstOrThrow();
    expect(row.tokenHash).not.toContain(grant.body.token.split(".")[1]);
  });
});
