import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Scheduling (e2e)", () => {
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
    const workspace = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: registered.body.organizationId, name: "Core" })
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
    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);

    const makeTask = async (
      title: string,
      extra: Record<string, unknown> = {},
    ): Promise<string> => {
      const created = await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
        .send({
          goalId: goal.body.goalId,
          title,
          acceptanceCriteria: ["done"],
          assigneeType: "AGENT",
          assigneeId: "a-1",
          ...extra,
        })
        .expect(201);
      return created.body.taskId as string;
    };

    return {
      auth,
      asAgent,
      userId: logged.body.userId as string,
      workspaceId,
      goalId: goal.body.goalId as string,
      makeTask,
      base: `/workspaces/${workspaceId}/schedule`,
      tasks: `/workspaces/${workspaceId}/tasks`,
    };
  }

  /** §9.5 — a task becomes runnable when all its dependencies are satisfied. */
  it("holds a task until its dependency is completed, and names what holds it", async () => {
    const ctx = await setup();
    const first = await ctx.makeTask("first");
    const second = await ctx.makeTask("second");
    await ctx
      .auth(request(http).post(`${ctx.tasks}/${second}/dependencies`))
      .send({ dependsOnTaskId: first })
      .expect(200);

    const before = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(before.body.ready.map((e: { taskId: string }) => e.taskId)).toEqual([first]);
    // §17.8 — not "not ready", but held by what.
    const held = before.body.waiting.find((e: { taskId: string }) => e.taskId === second);
    expect(held.blockedBy).toEqual([{ id: first, reason: "dependency not completed" }]);

    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await ctx
        .asAgent(request(http).post(`${ctx.tasks}/${first}/status`))
        .send({ status })
        .expect(200);
    }
    await ctx.asAgent(request(http).post(`${ctx.tasks}/${first}/submit`)).expect(200);
    await ctx.auth(request(http).post(`${ctx.tasks}/${first}/complete`)).expect(200);

    const after = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(after.body.ready.map((e: { taskId: string }) => e.taskId)).toEqual([second]);
  });

  /**
   * §10.18d — a written precedence, never a weighted score. The property that
   * buys: a BACKGROUND task releasing many others still never overtakes a
   * CRITICAL one.
   */
  it("orders by priority first, and nothing overtakes it", async () => {
    const ctx = await setup();
    const hub = await ctx.makeTask("hub", { priority: "BACKGROUND" });
    for (let i = 0; i < 3; i++) {
      const dependent = await ctx.makeTask(`dependent ${i}`);
      await ctx
        .auth(request(http).post(`${ctx.tasks}/${dependent}/dependencies`))
        .send({ dependsOnTaskId: hub })
        .expect(200);
    }
    const critical = await ctx.makeTask("critical", { priority: "CRITICAL" });

    const schedule = await ctx.auth(request(http).get(ctx.base)).expect(200);

    expect(schedule.body.ready[0].taskId).toBe(critical);
    const hubEntry = schedule.body.ready.find(
      (e: { taskId: string }) => e.taskId === hub,
    );
    // It is still credited with what it releases — counted, not estimated.
    expect(hubEntry.unblocks).toBe(3);
  });

  /**
   * §9.16 — "un système entièrement à jour finit par se taire pour de bon".
   * An actor asking what to do never gets a bare empty list.
   */
  it("answers usefully even when there is nothing for the caller to do", async () => {
    const ctx = await setup();
    const blocking = await ctx.makeTask("blocking");
    const blocked = await ctx.makeTask("blocked");
    await ctx
      .auth(request(http).post(`${ctx.tasks}/${blocked}/dependencies`))
      .send({ dependsOnTaskId: blocking })
      .expect(200);
    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await ctx
        .asAgent(request(http).post(`${ctx.tasks}/${blocking}/status`))
        .send({ status })
        .expect(200);
    }

    const mine = await ctx.asAgent(request(http).get(`${ctx.base}/mine`)).expect(200);

    expect(mine.body.next).toBeNull();
    // The silence is replaced by a signal: one in flight, one waiting on it.
    expect(mine.body.summary.inFlightCount).toBe(1);
    expect(mine.body.summary.waitingCount).toBe(1);
    expect(mine.body.summary.nothingToDo).toBe(false);
    expect(mine.body.waiting[0].blockedBy[0].id).toBe(blocking);
  });

  it("says outright when the workspace has genuinely nothing left", async () => {
    const ctx = await setup();

    const mine = await ctx.asAgent(request(http).get(`${ctx.base}/mine`)).expect(200);

    expect(mine.body.summary.nothingToDo).toBe(true);
    expect(mine.body.next).toBeNull();
  });

  /** §9.3 lists Goals among the inputs, and a set-aside goal is not work. */
  it("stops offering the tasks of a cancelled goal", async () => {
    const ctx = await setup();
    await ctx.makeTask("under a doomed goal");

    expect(
      (await ctx.auth(request(http).get(ctx.base)).expect(200)).body.ready,
    ).toHaveLength(1);

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals/${ctx.goalId}/status`))
      .send({ status: "CANCELLED" })
      .expect(200);

    const after = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(after.body.ready).toHaveLength(0);
    expect(after.body.summary.nothingToDo).toBe(true);
  });

  /** §4.6 — assignment is an explicit act; the queue shows, it never hands over. */
  it("shows a task assigned to someone else without offering it as yours", async () => {
    const ctx = await setup();
    await ctx.makeTask("someone else's", {
      assigneeType: "HUMAN",
      assigneeId: ctx.userId,
    });

    const mine = await ctx.asAgent(request(http).get(`${ctx.base}/mine`)).expect(200);

    expect(mine.body.next).toBeNull();
    expect(mine.body.unassignedReady).toHaveLength(0);
    // But the workspace queue still shows it, with its owner.
    const all = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(all.body.ready[0].assignee).toEqual({ type: "HUMAN", id: ctx.userId });
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
