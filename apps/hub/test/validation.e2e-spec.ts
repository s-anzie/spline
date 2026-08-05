import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Validation (e2e)", () => {
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
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId: registered.body.organizationId as string, displayName: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const goal = await asOwner(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);
    const task = await asOwner(request(http).post(`/workspaces/${workspaceId}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Wire the daemon",
        acceptanceCriteria: ["it connects"],
        assigneeType: "AGENT",
        assigneeId: "a-1",
      })
      .expect(201);

    return {
      token,
      agentToken: issued.value.token,
      organizationId: registered.body.organizationId as string,
      workspaceId,
      taskId: task.body.taskId as string,
      tasks: `/workspaces/${workspaceId}/tasks`,
      base: `/workspaces/${workspaceId}/validations`,
    };
  }

  async function bringToValidating(ctx: Awaited<ReturnType<typeof setup>>) {
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/status`))
        .send({ status })
        .expect(200);
    }
  }

  /**
   * The debt this module closes, end to end: `/submit` used to move the
   * status and record nothing at all, and `complete()` only checked that the
   * task had *passed through* a step named validation — never that a proof
   * existed (§4.9, §10.9, §11.7).
   */
  it("submitting asks for proof, and completion is refused until it exists", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    await bringToValidating(ctx);

    await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/submit`))
      .send({ validations: ["unit_test", "human_review"] })
      .expect(200);

    const asked = await asOwner(
      request(http).get(`${ctx.base}?taskId=${ctx.taskId}`),
    ).expect(200);
    expect(asked.body.map((v: { type: string }) => v.type).sort()).toEqual([
      "human_review",
      "unit_test",
    ]);
    expect(asked.body.every((v: { status: string }) => v.status === "PENDING")).toBe(true);

    // The proof is not there yet: completion is refused, and it says which.
    const refused = await asOwner(
      request(http).post(`${ctx.tasks}/${ctx.taskId}/complete`),
    ).expect(409);
    expect(refused.body.message).toContain("unit_test");

    // An agent cannot pronounce on its own work (§10.9).
    const unitTest = asked.body.find((v: { type: string }) => v.type === "unit_test");
    await asAgent(request(http).post(`${ctx.base}/${unitTest.id}/settle`))
      .send({ action: "SUCCEEDED" })
      .expect(403);

    for (const validation of asked.body) {
      await asOwner(request(http).post(`${ctx.base}/${validation.id}/settle`))
        .send({ action: "SUCCEEDED", output: "all good" })
        .expect(200);
    }

    await asOwner(request(http).post(`${ctx.tasks}/${ctx.taskId}/complete`)).expect(200);
  });

  it("a failed validation alerts whoever asked for it (§17.9)", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    await bringToValidating(ctx);
    await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/submit`))
      .send({ validations: ["unit_test"] })
      .expect(200);

    const asked = await asOwner(
      request(http).get(`${ctx.base}?taskId=${ctx.taskId}`),
    ).expect(200);
    await asOwner(request(http).post(`${ctx.base}/${asked.body[0].id}/settle`))
      .send({ action: "FAILED", output: "3 tests failing" })
      .expect(200);

    const unread = await asAgent(
      request(http).get(`/workspaces/${ctx.workspaceId}/notifications/unread/mine`),
    ).expect(200);
    const alert = unread.body.find((entry: { notification: { title: string } }) =>
      entry.notification.title.includes("Validation failed"),
    );
    expect(alert).toBeDefined();
    expect(alert.notification.body).toBe("3 tests failing");
  });

  /** §11.8 — a change invalidates what was proven, without erasing it. */
  it("invalidates proof without deleting the history, and blocks completion again", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    await bringToValidating(ctx);
    await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/submit`))
      .send({ validations: ["unit_test"] })
      .expect(200);
    const asked = await asOwner(
      request(http).get(`${ctx.base}?taskId=${ctx.taskId}`),
    ).expect(200);
    await asOwner(request(http).post(`${ctx.base}/${asked.body[0].id}/settle`))
      .send({ action: "SUCCEEDED" })
      .expect(200);

    const invalidated = await asOwner(
      request(http).post(`${ctx.tasks}/${ctx.taskId}/validations/invalidate`),
    )
      .send({ reason: "the branch moved" })
      .expect(200);
    expect(invalidated.body.invalidated).toBe(1);

    const after = await asOwner(
      request(http).get(`${ctx.base}?taskId=${ctx.taskId}`),
    ).expect(200);
    // The verdict is still on record; it simply no longer counts.
    expect(after.body[0].status).toBe("SUCCEEDED");
    expect(after.body[0].satisfies).toBe(false);
    expect(after.body[0].invalidationReason).toBe("the branch moved");

    await asOwner(request(http).post(`${ctx.tasks}/${ctx.taskId}/complete`)).expect(409);
  });

  it("a non-mandatory validation never blocks completion, and skipping is recorded", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    await bringToValidating(ctx);

    await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/validations`))
      .send({
        validations: [
          { type: "performance_bench", mandatory: false },
          { type: "lint", mandatory: true },
        ],
      })
      .expect(201);
    await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/submit`)).expect(200);

    const asked = await asOwner(
      request(http).get(`${ctx.base}?taskId=${ctx.taskId}`),
    ).expect(200);
    const lint = asked.body.find((v: { type: string }) => v.type === "lint");
    await asOwner(request(http).post(`${ctx.base}/${lint.id}/settle`))
      .send({ action: "SKIPPED", output: "no linter configured yet" })
      .expect(200);

    // The optional one is still pending and must not stand in the way.
    await asOwner(request(http).post(`${ctx.tasks}/${ctx.taskId}/complete`)).expect(200);

    const after = await asOwner(
      request(http).get(`${ctx.base}?taskId=${ctx.taskId}`),
    ).expect(200);
    const skipped = after.body.find((v: { type: string }) => v.type === "lint");
    expect(skipped.output).toBe("no linter configured yet");
  });

  it("never reaches another workspace's validations", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const second = await asOwner(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);
    const otherId = second.body.workspaceId as string;
    await bringToValidating(ctx);
    await request(http)
      .post(`${ctx.tasks}/${ctx.taskId}/submit`)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .send({ validations: ["unit_test"] })
      .expect(200);
    const asked = await asOwner(
      request(http).get(`${ctx.base}?taskId=${ctx.taskId}`),
    ).expect(200);

    await asOwner(
      request(http).post(`/workspaces/${otherId}/validations/${asked.body[0].id}/settle`),
    )
      .send({ action: "SUCCEEDED" })
      .expect(404);

    expect(
      (await asOwner(request(http).get(`/workspaces/${otherId}/validations`)).expect(200))
        .body,
    ).toHaveLength(0);
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
