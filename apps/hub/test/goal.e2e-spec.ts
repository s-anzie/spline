import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Goal (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
      .send({
        email: "owner@example.com",
        password: "a-strong-password",
        displayName: "Bradley",
      })
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
    return {
      token,
      workspaceId: workspace.body.workspaceId as string,
      organizationId: registered.body.organizationId as string,
    };
  }

  /** An AGENT_MANAGER member — can drive goals but never approve completion. */
  async function agentManager(workspaceId: string, organizationId: string) {
    const issued = await app
      .get(IssueActorCredentialUseCase)
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId, displayName: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_MANAGER",
    });
    return issued.value.token;
  }

  it("creates a goal, lists it, reads it back", async () => {
    const { token, workspaceId } = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

    const created = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship the runtime", successCriteria: ["Daemon connects"] })
      .expect(201);

    const listed = await auth(
      request(http).get(`/workspaces/${workspaceId}/goals`),
    ).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].status).toBe("PLANNED");
    expect(listed.body[0].progress).toBe(0);
    expect(listed.body[0].allowedStatusTargets).toEqual(["ACTIVE", "CANCELLED"]);

    const fetched = await auth(
      request(http).get(`/workspaces/${workspaceId}/goals/${created.body.goalId}`),
    ).expect(200);
    expect(fetched.body.successCriteria).toEqual(["Daemon connects"]);
  });

  it("rejects a goal without success criteria (§4.5)", async () => {
    const { token, workspaceId } = await setup();

    await request(http)
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "No criteria", successCriteria: [] })
      .expect(400);
  });

  it("lists root goals with ?parentGoalId=root and children by id", async () => {
    const { token, workspaceId } = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const parent = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Parent", successCriteria: ["c"] })
      .expect(201);
    await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Child", successCriteria: ["c"], parentGoalId: parent.body.goalId })
      .expect(201);

    const roots = await auth(
      request(http).get(`/workspaces/${workspaceId}/goals?parentGoalId=root`),
    ).expect(200);
    const children = await auth(
      request(http).get(
        `/workspaces/${workspaceId}/goals?parentGoalId=${parent.body.goalId}`,
      ),
    ).expect(200);

    expect(roots.body.map((g: { title: string }) => g.title)).toEqual(["Parent"]);
    expect(children.body.map((g: { title: string }) => g.title)).toEqual(["Child"]);
  });

  it("completion is an approval: an agent manager reaches REVIEW but cannot close", async () => {
    const { token, workspaceId, organizationId } = await setup();
    const agentToken = await agentManager(workspaceId, organizationId);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${agentToken}`);

    const created = await asAgent(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Agent goal", successCriteria: ["c"] })
      .expect(201);
    const goalUrl = `/workspaces/${workspaceId}/goals/${created.body.goalId}`;

    await asAgent(request(http).post(`${goalUrl}/status`)).send({ status: "ACTIVE" }).expect(200);
    await asAgent(request(http).post(`${goalUrl}/status`)).send({ status: "REVIEW" }).expect(200);
    // The agent may not approve — approve_validation is denied to every agent role.
    await asAgent(request(http).post(`${goalUrl}/complete`)).expect(403);

    await request(http)
      .post(`${goalUrl}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const fetched = await request(http)
      .get(goalUrl)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.status).toBe("COMPLETED");
    expect(fetched.body.progress).toBe(100);
  });

  it("COMPLETED cannot be reached through the status route (400)", async () => {
    const { token, workspaceId } = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const created = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "G", successCriteria: ["c"] })
      .expect(201);
    const goalUrl = `/workspaces/${workspaceId}/goals/${created.body.goalId}`;

    await auth(request(http).post(`${goalUrl}/status`)).send({ status: "ACTIVE" }).expect(200);
    await auth(request(http).post(`${goalUrl}/status`)).send({ status: "REVIEW" }).expect(200);
    await auth(request(http).post(`${goalUrl}/status`))
      .send({ status: "COMPLETED" })
      .expect(400);
  });

  it("refuses completion while a sub-goal is open (409), allows it once closed", async () => {
    const { token, workspaceId } = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const parent = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Parent", successCriteria: ["c"] })
      .expect(201);
    const child = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Child", successCriteria: ["c"], parentGoalId: parent.body.goalId })
      .expect(201);
    const parentUrl = `/workspaces/${workspaceId}/goals/${parent.body.goalId}`;
    const childUrl = `/workspaces/${workspaceId}/goals/${child.body.goalId}`;

    await auth(request(http).post(`${parentUrl}/status`)).send({ status: "ACTIVE" }).expect(200);
    await auth(request(http).post(`${parentUrl}/status`)).send({ status: "REVIEW" }).expect(200);
    await auth(request(http).post(`${parentUrl}/complete`)).expect(409);

    await auth(request(http).post(`${childUrl}/status`)).send({ status: "CANCELLED" }).expect(200);
    await auth(request(http).post(`${parentUrl}/complete`)).expect(200);
  });

  it("idempotent status repeat (200), invalid transition (409), terminal (410)", async () => {
    const { token, workspaceId } = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const created = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "G", successCriteria: ["c"] })
      .expect(201);
    const statusUrl = `/workspaces/${workspaceId}/goals/${created.body.goalId}/status`;

    await auth(request(http).post(statusUrl)).send({ status: "PLANNED" }).expect(200);
    await auth(request(http).post(statusUrl)).send({ status: "BLOCKED" }).expect(409);
    await auth(request(http).post(statusUrl)).send({ status: "CANCELLED" }).expect(200);
    await auth(request(http).post(statusUrl)).send({ status: "ACTIVE" }).expect(410);
  });

  it("dependencies gate activation and reject cycles (§5.6, §9.5)", async () => {
    const { token, workspaceId } = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const base = `/workspaces/${workspaceId}/goals`;
    const make = async (title: string) =>
      (
        await auth(request(http).post(base))
          .send({ title, successCriteria: ["c"] })
          .expect(201)
      ).body.goalId as string;
    const [blocker, dependent] = [await make("blocker"), await make("dependent")];

    await auth(request(http).post(`${base}/${dependent}/dependencies`))
      .send({ dependsOnGoalId: blocker })
      .expect(200);
    // The reverse edge would close a cycle.
    await auth(request(http).post(`${base}/${blocker}/dependencies`))
      .send({ dependsOnGoalId: dependent })
      .expect(409);

    // Blocked until the dependency completes.
    await auth(request(http).post(`${base}/${dependent}/status`))
      .send({ status: "ACTIVE" })
      .expect(409);

    await auth(request(http).post(`${base}/${blocker}/status`)).send({ status: "ACTIVE" }).expect(200);
    await auth(request(http).post(`${base}/${blocker}/status`)).send({ status: "REVIEW" }).expect(200);
    await auth(request(http).post(`${base}/${blocker}/complete`)).expect(200);

    await auth(request(http).post(`${base}/${dependent}/status`))
      .send({ status: "ACTIVE" })
      .expect(200);

    const view = await auth(request(http).get(`${base}/${dependent}`)).expect(200);
    expect(view.body.dependsOnGoalIds).toEqual([blocker]);

    await auth(
      request(http).delete(`${base}/${dependent}/dependencies/${blocker}`),
    ).expect(200);
    const cleared = await auth(request(http).get(`${base}/${dependent}`)).expect(200);
    expect(cleared.body.dependsOnGoalIds).toEqual([]);
  });

  it("isolates goals per workspace and requires membership", async () => {
    const { token, workspaceId } = await setup();
    const created = await request(http)
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Private", successCriteria: ["c"] })
      .expect(201);

    await request(http)
      .post("/auth/register")
      .send({
        email: "stranger@example.com",
        password: "a-strong-password",
        displayName: "S",
      })
      .expect(201);
    const strangerLogin = await request(http)
      .post("/auth/login")
      .send({ email: "stranger@example.com", password: "a-strong-password" })
      .expect(200);

    await request(http)
      .get(`/workspaces/${workspaceId}/goals/${created.body.goalId}`)
      .set("Authorization", `Bearer ${strangerLogin.body.accessToken}`)
      .expect(403);
    await request(http).get(`/workspaces/${workspaceId}/goals`).expect(401);
  });
});
