import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Task (e2e)", () => {
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

  /** A human owner, an agent contributor member, and a goal to hang tasks on. */
  async function setup() {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "a-strong-password", displayName: "B" })
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

    const goal = await request(http)
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);

    return {
      token,
      agentToken: issued.value.token,
      workspaceId,
      goalId: goal.body.goalId as string,
      base: `/workspaces/${workspaceId}/tasks`,
    };
  }

  function body(goalId: string, overrides: Record<string, unknown> = {}) {
    return {
      goalId,
      title: "Wire the daemon",
      acceptanceCriteria: ["It connects"],
      assigneeType: "AGENT",
      assigneeId: "a-1",
      ...overrides,
    };
  }

  it("a task is created already assigned — never up for grabs (§4.6)", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    const created = await auth(request(http).post(ctx.base))
      .send(body(ctx.goalId))
      .expect(201);

    const fetched = await auth(
      request(http).get(`${ctx.base}/${created.body.taskId}`),
    ).expect(200);
    expect(fetched.body.assignee).toEqual({ type: "AGENT", id: "a-1" });
    expect(fetched.body.status).toBe("PLANNED");
    expect(fetched.body.openBlockerCount).toBe(0);
    expect(fetched.body.allowedStatusTargets).toEqual(["READY", "BLOCKED", "CANCELLED"]);
  });

  it("refuses creation without an assignee, and to a non-member", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    await auth(request(http).post(ctx.base))
      .send({ goalId: ctx.goalId, title: "T", acceptanceCriteria: ["c"] })
      .expect(400);
    await auth(request(http).post(ctx.base))
      .send(body(ctx.goalId, { assigneeId: "stranger" }))
      .expect(403);
  });

  it("full collaboration: the agent works and submits, only the human completes", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    const created = await auth(request(http).post(ctx.base))
      .send(body(ctx.goalId))
      .expect(201);
    const task = `${ctx.base}/${created.body.taskId}`;

    // The agent drives its own work forward.
    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await asAgent(request(http).post(`${task}/status`)).send({ status }).expect(200);
    }
    await asAgent(request(http).post(`${task}/submit`)).expect(200);

    // It may not approve its own work.
    await asAgent(request(http).post(`${task}/complete`)).expect(403);
    await auth(request(http).post(`${task}/complete`)).expect(200);

    const fetched = await auth(request(http).get(task)).expect(200);
    expect(fetched.body.status).toBe("COMPLETED");

    // The goal's progress followed along.
    const goal = await auth(
      request(http).get(`/workspaces/${ctx.workspaceId}/goals/${ctx.goalId}`),
    ).expect(200);
    expect(goal.body.progress).toBe(100);
  });

  it("COMPLETED is refused through the status route (§4.24)", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const created = await auth(request(http).post(ctx.base))
      .send(body(ctx.goalId))
      .expect(201);

    await auth(request(http).post(`${ctx.base}/${created.body.taskId}/status`))
      .send({ status: "COMPLETED" })
      .expect(400);
  });

  it("a blocker freezes the task and resolving it resumes exactly where it stood", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    const created = await auth(request(http).post(ctx.base))
      .send(body(ctx.goalId))
      .expect(201);
    const task = `${ctx.base}/${created.body.taskId}`;
    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await asAgent(request(http).post(`${task}/status`)).send({ status }).expect(200);
    }

    const blocker = await asAgent(request(http).post(`${task}/blockers`))
      .send({ type: "INFRASTRUCTURE", description: "disk full" })
      .expect(201);
    let fetched = await auth(request(http).get(task)).expect(200);
    expect(fetched.body.status).toBe("BLOCKED");
    expect(fetched.body.openBlockerCount).toBe(1);

    // The executor reports, but may not clear its own obstacle.
    await asAgent(
      request(http).post(`${task}/blockers/${blocker.body.blockerId}/resolve`),
    )
      .send({ resolution: "freed" })
      .expect(403);
    await auth(request(http).post(`${task}/blockers/${blocker.body.blockerId}/resolve`))
      .send({ resolution: "freed" })
      .expect(200);

    fetched = await auth(request(http).get(task)).expect(200);
    expect(fetched.body.status).toBe("RUNNING");
    expect(fetched.body.openBlockerCount).toBe(0);
  });

  it("dependencies gate readiness and reject cycles (§9.5)", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    const make = async (title: string) =>
      (await auth(request(http).post(ctx.base)).send(body(ctx.goalId, { title })).expect(201))
        .body.taskId as string;
    const [first, second] = [await make("first"), await make("second")];

    await auth(request(http).post(`${ctx.base}/${second}/dependencies`))
      .send({ dependsOnTaskId: first })
      .expect(200);
    await auth(request(http).post(`${ctx.base}/${first}/dependencies`))
      .send({ dependsOnTaskId: second })
      .expect(409);

    await asAgent(request(http).post(`${ctx.base}/${second}/status`))
      .send({ status: "READY" })
      .expect(409);

    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await asAgent(request(http).post(`${ctx.base}/${first}/status`))
        .send({ status })
        .expect(200);
    }
    await asAgent(request(http).post(`${ctx.base}/${first}/submit`)).expect(200);
    await auth(request(http).post(`${ctx.base}/${first}/complete`)).expect(200);

    await asAgent(request(http).post(`${ctx.base}/${second}/status`))
      .send({ status: "READY" })
      .expect(200);
    await auth(
      request(http).delete(`${ctx.base}/${second}/dependencies/${first}`),
    ).expect(200);
  });

  it("GET /tasks/mine returns the caller's own queue", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    await auth(request(http).post(ctx.base)).send(body(ctx.goalId)).expect(201);

    const mine = await request(http)
      .get(`${ctx.base}/mine`)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .expect(200);

    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].assignee.id).toBe("a-1");
  });

  it("reassigns, updates, cancels, and filters", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const created = await auth(request(http).post(ctx.base))
      .send(body(ctx.goalId))
      .expect(201);
    const task = `${ctx.base}/${created.body.taskId}`;

    await auth(request(http).patch(task)).send({ title: "Renamed", priority: "CRITICAL" }).expect(200);
    await auth(request(http).post(`${task}/assign`))
      .send({ assigneeType: "AGENT", assigneeId: "stranger" })
      .expect(403);
    await auth(request(http).post(`${task}/cancel`)).expect(200);

    const cancelled = await auth(request(http).get(task)).expect(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.title).toBe("Renamed");

    const filtered = await auth(
      request(http).get(`${ctx.base}?status=CANCELLED&goalId=${ctx.goalId}`),
    ).expect(200);
    expect(filtered.body).toHaveLength(1);
  });

  it("isolates tasks per workspace and requires authentication", async () => {
    const ctx = await setup();
    await request(http)
      .post("/auth/register")
      .send({ email: "s@example.com", password: "a-strong-password", displayName: "S" })
      .expect(201);
    const stranger = await request(http)
      .post("/auth/login")
      .send({ email: "s@example.com", password: "a-strong-password" })
      .expect(200);

    await request(http).get(ctx.base).expect(401);
    await request(http)
      .get(ctx.base)
      .set("Authorization", `Bearer ${stranger.body.accessToken}`)
      .expect(403);
  });

  it("a goal cannot be declared achieved while its tasks are still open", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    const goal = `/workspaces/${ctx.workspaceId}/goals/${ctx.goalId}`;
    const created = await auth(request(http).post(ctx.base))
      .send(body(ctx.goalId))
      .expect(201);
    const task = `${ctx.base}/${created.body.taskId}`;

    await auth(request(http).post(`${goal}/status`)).send({ status: "ACTIVE" }).expect(200);
    await auth(request(http).post(`${goal}/status`)).send({ status: "REVIEW" }).expect(200);
    await auth(request(http).post(`${goal}/complete`)).expect(409);

    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await asAgent(request(http).post(`${task}/status`)).send({ status }).expect(200);
    }
    await asAgent(request(http).post(`${task}/submit`)).expect(200);
    await auth(request(http).post(`${task}/complete`)).expect(200);

    await auth(request(http).post(`${goal}/complete`)).expect(200);
  });

  describe("cross-module consistency", () => {
    it("cancelling a goal cancels its live tasks but never rewrites settled ones", async () => {
      const ctx = await setup();
      const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
      const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
      const goal = `/workspaces/${ctx.workspaceId}/goals/${ctx.goalId}`;
      const live = (await auth(request(http).post(ctx.base)).send(body(ctx.goalId, { title: "live" })).expect(201))
        .body.taskId as string;
      const done = (await auth(request(http).post(ctx.base)).send(body(ctx.goalId, { title: "done" })).expect(201))
        .body.taskId as string;

      for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
        await asAgent(request(http).post(`${ctx.base}/${done}/status`)).send({ status }).expect(200);
      }
      await asAgent(request(http).post(`${ctx.base}/${done}/submit`)).expect(200);
      await auth(request(http).post(`${ctx.base}/${done}/complete`)).expect(200);

      await auth(request(http).post(`${goal}/status`)).send({ status: "CANCELLED" }).expect(200);
      // The listener reacts to the published event, not to a direct call.
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect((await auth(request(http).get(`${ctx.base}/${live}`)).expect(200)).body.status).toBe(
        "CANCELLED",
      );
      expect((await auth(request(http).get(`${ctx.base}/${done}`)).expect(200)).body.status).toBe(
        "COMPLETED",
      );
    });

    it("a member owning live work cannot be removed until it is reassigned", async () => {
      const ctx = await setup();
      const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
      const members = `/workspaces/${ctx.workspaceId}/members`;
      const created = await auth(request(http).post(ctx.base)).send(body(ctx.goalId)).expect(201);
      const listed = await auth(request(http).get(members)).expect(200);
      const agentMembership = listed.body.find(
        (m: { actorType: string }) => m.actorType === "AGENT",
      );

      await auth(request(http).delete(`${members}/${agentMembership.membershipId}`)).expect(409);

      // Settle the work, then removal is allowed.
      await auth(request(http).post(`${ctx.base}/${created.body.taskId}/cancel`)).expect(200);
      await auth(request(http).delete(`${members}/${agentMembership.membershipId}`)).expect(200);
    });
  });
});
