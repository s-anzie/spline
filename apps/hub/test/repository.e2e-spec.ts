import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Repository (e2e)", () => {
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
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${issued.value.token}`);
    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);
    const task = await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Wire the daemon",
        acceptanceCriteria: ["it connects"],
        assigneeType: "AGENT",
        assigneeId: "a-1",
      })
      .expect(201);

    const repository = await auth(
      request(http).post(`/workspaces/${workspaceId}/repositories`),
    )
      .send({ name: "spline", origin: "git@example.com:spline.git" })
      .expect(201);

    return {
      auth,
      asAgent,
      organizationId,
      workspaceId,
      goalId: goal.body.goalId as string,
      taskId: task.body.taskId as string,
      repositoryId: repository.body.repositoryId as string,
      base: `/workspaces/${workspaceId}/repositories/${repository.body.repositoryId}`,
      tasks: `/workspaces/${workspaceId}/tasks`,
    };
  }

  /**
   * §26: "une Task, un Goal ou un Workspace fonctionnent pleinement sans
   * qu'aucun Repository n'existe — le logiciel reste un cas d'usage, jamais
   * une condition". The vision, checked mechanically.
   */
  it("changes nothing for a workspace that has no repository", async () => {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "solo@example.com", password: "a-strong-password", displayName: "S" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "solo@example.com", password: "a-strong-password" })
      .expect(200);
    const auth = (r: request.Test) =>
      r.set("Authorization", `Bearer ${logged.body.accessToken}`);
    const workspace = await auth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "No code here" })
      .expect(201);
    const id = workspace.body.workspaceId;

    // A whole goal → task → proof → completion cycle, without any repository.
    const goal = await auth(request(http).post(`/workspaces/${id}/goals`))
      .send({ title: "Write the handbook", successCriteria: ["it is readable"] })
      .expect(201);
    const task = await auth(request(http).post(`/workspaces/${id}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Draft chapter one",
        acceptanceCriteria: ["it exists"],
        assigneeType: "HUMAN",
        assigneeId: logged.body.userId,
      })
      .expect(201);
    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await auth(request(http).post(`/workspaces/${id}/tasks/${task.body.taskId}/status`))
        .send({ status })
        .expect(200);
    }
    await auth(request(http).post(`/workspaces/${id}/tasks/${task.body.taskId}/submit`))
      .expect(200);
    await auth(request(http).post(`/workspaces/${id}/tasks/${task.body.taskId}/complete`))
      .expect(200);

    // And the health of that workspace is unaffected by having no repository.
    expect((await auth(request(http).get(`/workspaces/${id}/health`))).body.level).toBe(
      "HEALTHY",
    );
    expect((await auth(request(http).get(`/workspaces/${id}/repositories`))).body).toEqual(
      [],
    );
  });

  /** §8.3 — the name is derived, and protected names are refused outright. */
  it("derives a branch name and refuses to hand a task a protected one", async () => {
    const ctx = await setup();

    const branch = await ctx
      .asAgent(request(http).post(`${ctx.base}/branches`))
      .send({ kind: "TASK", sourceId: ctx.taskId, taskId: ctx.taskId })
      .expect(201);

    const branches = await ctx.auth(request(http).get(`${ctx.base}/branches`)).expect(200);
    const created = branches.body.find(
      (b: { id: string }) => b.id === branch.body.branchId,
    );
    expect(created.name).toBe(`task/${ctx.taskId}`);
    expect(created.kind).toBe("TASK");

    // `main` is recorded as protected the moment the repository is registered.
    const main = branches.body.find((b: { name: string }) => b.name === "main");
    expect(main.protected).toBe(true);

    // Asking again gives the same branch, not a second one.
    const again = await ctx
      .asAgent(request(http).post(`${ctx.base}/branches`))
      .send({ kind: "TASK", sourceId: ctx.taskId, taskId: ctx.taskId })
      .expect(201);
    expect(again.body.branchId).toBe(branch.body.branchId);

    // And there is no way to name a working branch `main`: the name is
    // derived, so the worst one can ask for is `task/main`.
    const harmless = await ctx
      .asAgent(request(http).post(`${ctx.base}/branches`))
      .send({ kind: "TASK", sourceId: "main", taskId: ctx.taskId })
      .expect(201);
    const all = await ctx.auth(request(http).get(`${ctx.base}/branches`)).expect(200);
    expect(
      all.body.find((b: { id: string }) => b.id === harmless.body.branchId).name,
    ).toBe("task/main");
  });

  /** §8.4 — "deux tâches ne partagent jamais le même Worktree". */
  it("gives a task one worktree, and refuses a second", async () => {
    const ctx = await setup();
    const branch = await ctx
      .asAgent(request(http).post(`${ctx.base}/branches`))
      .send({ kind: "TASK", sourceId: ctx.taskId, taskId: ctx.taskId })
      .expect(201);

    const worktree = await ctx
      .asAgent(request(http).post(`${ctx.base}/worktrees`))
      .send({ branchId: branch.body.branchId, taskId: ctx.taskId, path: "/w/1" })
      .expect(201);

    await ctx
      .asAgent(request(http).post(`${ctx.base}/worktrees`))
      .send({ branchId: branch.body.branchId, taskId: ctx.taskId, path: "/w/2" })
      .expect(409);

    // Archiving frees the slot — §8.5 ends on Archive.
    await ctx
      .asAgent(
        request(http).post(`${ctx.base}/worktrees/${worktree.body.worktreeId}/archive`),
      )
      .expect(200);
    await ctx
      .asAgent(request(http).post(`${ctx.base}/worktrees`))
      .send({ branchId: branch.body.branchId, taskId: ctx.taskId, path: "/w/2" })
      .expect(201);
  });

  /**
   * §8.7 — never performed by an agent, and only once the task's work is
   * proven. That last condition is answered by the same port §11.7 uses:
   * it is the same question, so there is no second check to keep in step.
   */
  it("refuses a merge until the work is proven, and never lets an agent decide", async () => {
    const ctx = await setup();
    const branch = await ctx
      .asAgent(request(http).post(`${ctx.base}/branches`))
      .send({ kind: "TASK", sourceId: ctx.taskId, taskId: ctx.taskId })
      .expect(201);
    const branches = await ctx.auth(request(http).get(`${ctx.base}/branches`)).expect(200);
    const main = branches.body.find((b: { name: string }) => b.name === "main");

    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await ctx
        .asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/status`))
        .send({ status })
        .expect(200);
    }
    await ctx
      .asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/submit`))
      .send({ validations: ["build", "tests"] })
      .expect(200);

    const merge = await ctx
      .asAgent(request(http).post(`${ctx.base}/merges`))
      .send({
        sourceBranchId: branch.body.branchId,
        targetBranchId: main.id,
        taskId: ctx.taskId,
      })
      .expect(201);

    // An agent asking is fine; an agent deciding is not (§8.7).
    await ctx
      .asAgent(
        request(http).post(`${ctx.base}/merges/${merge.body.mergeRequestId}/decide`),
      )
      .send({ decision: "APPROVE" })
      .expect(403);

    // The proof is missing, and the refusal says which.
    const refused = await ctx
      .auth(request(http).post(`${ctx.base}/merges/${merge.body.mergeRequestId}/decide`))
      .send({ decision: "APPROVE" })
      .expect(409);
    expect(refused.body.message).toContain("build");

    const validations = await ctx
      .auth(
        request(http).get(`/workspaces/${ctx.workspaceId}/validations?taskId=${ctx.taskId}`),
      )
      .expect(200);
    for (const validation of validations.body) {
      await ctx
        .auth(
          request(http).post(
            `/workspaces/${ctx.workspaceId}/validations/${validation.id}/settle`,
          ),
        )
        .send({ action: "SUCCEEDED" })
        .expect(200);
    }

    await ctx
      .auth(request(http).post(`${ctx.base}/merges/${merge.body.mergeRequestId}/decide`))
      .send({ decision: "APPROVE" })
      .expect(200);

    const merges = await ctx.auth(request(http).get(`${ctx.base}/merges`)).expect(200);
    expect(merges.body[0].status).toBe("MERGED");
    expect(merges.body[0].decidedBy.type).toBe("HUMAN");

    // §18.7 audits "Merge" — the first of its four missing producers.
    const trail = await ctx
      .auth(
        request(http).get(
          `/workspaces/${ctx.workspaceId}/audit?action=repository.merge_decided`,
        ),
      )
      .expect(200);
    expect(trail.body).toHaveLength(1);
    expect(trail.body[0].before.status).toBe("PENDING");
    expect(trail.body[0].after.status).toBe("MERGED");
  });

  it("rejects a merge with a reason, and keeps it", async () => {
    const ctx = await setup();
    const branch = await ctx
      .asAgent(request(http).post(`${ctx.base}/branches`))
      .send({ kind: "TASK", sourceId: ctx.taskId, taskId: ctx.taskId })
      .expect(201);
    const branches = await ctx.auth(request(http).get(`${ctx.base}/branches`)).expect(200);
    const main = branches.body.find((b: { name: string }) => b.name === "main");
    const merge = await ctx
      .asAgent(request(http).post(`${ctx.base}/merges`))
      .send({
        sourceBranchId: branch.body.branchId,
        targetBranchId: main.id,
        taskId: ctx.taskId,
      })
      .expect(201);

    await ctx
      .auth(request(http).post(`${ctx.base}/merges/${merge.body.mergeRequestId}/decide`))
      .send({ decision: "REJECT", reason: "the approach changed" })
      .expect(200);

    const merges = await ctx.auth(request(http).get(`${ctx.base}/merges`)).expect(200);
    expect(merges.body[0].status).toBe("REJECTED");
    expect(merges.body[0].decisionReason).toBe("the approach changed");
    // Terminal: there is nothing left to do with it.
    expect(merges.body[0].allowedStatusTargets).toEqual([]);
  });

  it("never reaches another workspace's repositories", async () => {
    const ctx = await setup();
    const other = await ctx
      .auth(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);

    await ctx
      .auth(
        request(http).get(
          `/workspaces/${other.body.workspaceId}/repositories/${ctx.repositoryId}`,
        ),
      )
      .expect(404);
    expect(
      (await ctx.auth(request(http).get(`/workspaces/${other.body.workspaceId}/repositories`)))
        .body,
    ).toEqual([]);
  });

  it("requires authentication and membership", async () => {
    const ctx = await setup();
    await request(http).get(`/workspaces/${ctx.workspaceId}/repositories`).expect(401);

    await request(http)
      .post("/auth/register")
      .send({ email: "s@example.com", password: "a-strong-password", displayName: "S" })
      .expect(201);
    const stranger = await request(http)
      .post("/auth/login")
      .send({ email: "s@example.com", password: "a-strong-password" })
      .expect(200);
    await request(http)
      .get(`/workspaces/${ctx.workspaceId}/repositories`)
      .set("Authorization", `Bearer ${stranger.body.accessToken}`)
      .expect(403);
  });
});
