import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Policy (e2e)", () => {
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
      organizationId,
      workspaceId,
      goalId: goal.body.goalId as string,
      taskId: task.body.taskId as string,
      base: `/workspaces/${workspaceId}/policies`,
      tasks: `/workspaces/${workspaceId}/tasks`,
    };
  }

  /**
   * §12.2 — "une politique plus spécifique surcharge une politique plus
   * générale", and the resolution says which scope decided (§17.8), so an
   * agent can read the rules it works under instead of discovering them
   * through a refusal.
   */
  it("resolves the most specific scope, and names what decided", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    for (const [scopeType, scopeId, value] of [
      ["ORGANIZATION", ctx.organizationId, 3600],
      ["WORKSPACE", ctx.workspaceId, 600],
      ["GOAL", ctx.goalId, 120],
    ] as const) {
      await asOwner(request(http).post(ctx.base))
        .send({ scopeType, scopeId, type: "RUNTIME", rule: "timeout", value })
        .expect(201);
    }
    await asOwner(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "COST",
        rule: "max_tokens",
        value: 100000,
      })
      .expect(201);

    const effective = await asOwner(
      request(http).get(
        `${ctx.base}/effective?organizationId=${ctx.organizationId}&goalId=${ctx.goalId}&taskId=${ctx.taskId}`,
      ),
    ).expect(200);

    const timeout = effective.body.find((p: { rule: string }) => p.rule === "timeout");
    expect(timeout.value).toBe(120);
    expect(timeout.decidedBy.scopeType).toBe("GOAL");

    // Overriding one rule must not drop the others.
    const tokens = effective.body.find((p: { rule: string }) => p.rule === "max_tokens");
    expect(tokens.value).toBe(100000);
    expect(tokens.decidedBy.scopeType).toBe("WORKSPACE");
  });

  /**
   * The point of the module for the rest of the system: §12.3's Validation
   * type closes §11.7's fourth condition without a second refusal path — a
   * mandated proof becomes an ordinary mandatory Validation, and the
   * completion check enforces it knowing nothing about policies.
   */
  it("imposes a proof the agent never asked for, and it blocks completion", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);

    await asOwner(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "VALIDATION",
        rule: "required_validations",
        value: ["build", "security_scan"],
      })
      .expect(201);

    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/status`))
        .send({ status })
        .expect(200);
    }
    // The agent asks for one proof; the workspace requires two more.
    await asAgent(request(http).post(`${ctx.tasks}/${ctx.taskId}/submit`))
      .send({ validations: ["unit_test"] })
      .expect(200);

    const validations = await asOwner(
      request(http).get(`/workspaces/${ctx.workspaceId}/validations?taskId=${ctx.taskId}`),
    ).expect(200);
    expect(validations.body.map((v: { type: string }) => v.type).sort()).toEqual([
      "build",
      "security_scan",
      "unit_test",
    ]);

    await asOwner(request(http).post(`${ctx.tasks}/${ctx.taskId}/complete`)).expect(409);

    for (const validation of validations.body) {
      await asOwner(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validation.id}/settle`,
        ),
      )
        .send({ action: "SUCCEEDED" })
        .expect(200);
    }
    await asOwner(request(http).post(`${ctx.tasks}/${ctx.taskId}/complete`)).expect(200);
  });

  /** §1.7 — disabled leaves the resolution, stays on record. No delete route. */
  it("disables a rule without erasing what governed past decisions", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const created = await asOwner(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "timeout",
        value: 600,
      })
      .expect(201);

    await asOwner(
      request(http).post(`${ctx.base}/${created.body.policyId}/disable`),
    ).expect(200);

    expect(
      (await asOwner(request(http).get(`${ctx.base}/effective`)).expect(200)).body,
    ).toHaveLength(0);
    // Still listed when asked for, so a past decision remains explicable.
    const kept = await asOwner(
      request(http).get(`${ctx.base}?includeDisabled=true`),
    ).expect(200);
    expect(kept.body).toHaveLength(1);
    expect(kept.body[0].enabled).toBe(false);
  });

  it("replaces a rule at the same scope instead of creating a rival", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const body = {
      scopeType: "WORKSPACE" as const,
      scopeId: ctx.workspaceId,
      type: "RUNTIME" as const,
      rule: "timeout",
    };

    const first = await asOwner(request(http).post(ctx.base))
      .send({ ...body, value: 600 })
      .expect(201);
    const second = await asOwner(request(http).post(ctx.base))
      .send({ ...body, value: 900 })
      .expect(201);

    expect(second.body.policyId).toBe(first.body.policyId);
    const effective = await asOwner(
      request(http).get(`${ctx.base}/effective`),
    ).expect(200);
    expect(effective.body).toHaveLength(1);
    expect(effective.body[0].value).toBe(900);
  });

  it("only an owner sets the rules, and never across workspaces", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);

    // Agents cannot bypass the rules, which starts with not writing them (§12).
    await asAgent(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "timeout",
        value: 1,
      })
      .expect(403);

    const other = await asOwner(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);
    const created = await asOwner(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "timeout",
        value: 600,
      })
      .expect(201);

    await asOwner(
      request(http).post(
        `/workspaces/${other.body.workspaceId}/policies/${created.body.policyId}/disable`,
      ),
    ).expect(404);
    expect(
      (
        await asOwner(
          request(http).get(`/workspaces/${other.body.workspaceId}/policies`),
        ).expect(200)
      ).body,
    ).toHaveLength(0);
  });

  /** An identifier the API hands out must be resolvable through the API. */
  it("resolves the policy that /effective says decided a rule", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    await asOwner(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "RUNTIME",
        rule: "timeout",
        value: 600,
      })
      .expect(201);

    const effective = await asOwner(request(http).get(`${ctx.base}/effective`)).expect(200);
    const decidedBy = effective.body[0].decidedBy.policyId;

    const resolved = await asOwner(request(http).get(`${ctx.base}/${decidedBy}`)).expect(200);
    expect(resolved.body.rule).toBe("timeout");
    expect(resolved.body.value).toBe(600);

    // And never across workspaces.
    const other = await asOwner(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Elsewhere" })
      .expect(201);
    await asOwner(
      request(http).get(`/workspaces/${other.body.workspaceId}/policies/${decidedBy}`),
    ).expect(404);
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
