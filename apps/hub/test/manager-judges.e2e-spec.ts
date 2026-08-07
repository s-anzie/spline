import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §10.9, §11, §18.3 — a manager judging its TEAM's work, without ever judging
 * its own.
 *
 * The matrix carries a structural invariant: no agent role holds
 * `approve_validation`. That rule is about §10.9 — an agent never decides its
 * own work is complete — and it is right. What it also did, unintentionally,
 * was make every piece of proof a human errand: an agent asks, and a person
 * must answer, all night, for every task. A team that cannot finish anything
 * without waking somebody is not a team that works while you sleep.
 *
 * The two are separable, and the separation is the actor: a manager judging a
 * contributor's work is somebody else judging. So the invariant stays in the
 * matrix, and an owner may LEND the power to the manager, per workspace,
 * deliberately. What no switch can grant is judging your own work — that is
 * §10.9 itself and it is enforced regardless.
 */
describe("A manager may judge its team's work, never its own (e2e)", () => {
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

  async function team() {
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

    const issue = async (actorId: string, role: string) => {
      const issued = await app
        .get(IssueActorCredentialUseCase)
        .execute({ actorType: "AGENT", actorId, organizationId, displayName: actorId });
      await app.get(GrantWorkspaceMembershipUseCase).execute({
        actorType: "AGENT",
        actorId,
        workspaceId,
        role: role as "AGENT_MANAGER",
      });
      return issued.isSuccess ? issued.value.token : "";
    };
    const managerToken = await issue("manager", "AGENT_MANAGER");
    await issue("worker", "AGENT_CONTRIBUTOR");

    const asManager = (r: request.Test) =>
      r.set("Authorization", `Bearer ${managerToken}`);

    const goalId = (
      await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
        .send({ title: "G", successCriteria: ["c"] })
        .expect(201)
    ).body.goalId as string;

    const taskFor = async (assigneeId: string) =>
      (
        await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
          .send({
            goalId,
            title: `work for ${assigneeId}`,
            acceptanceCriteria: ["c"],
            assigneeType: "AGENT",
            assigneeId,
          })
          .expect(201)
      ).body.taskId as string;

    const proofOn = async (taskId: string) =>
      (
        await auth(
          request(http).post(`/workspaces/${workspaceId}/tasks/${taskId}/validations`),
        )
          .send({ validations: [{ type: "human_review", mandatory: true }] })
          .expect(201)
      ).body.validationIds[0] as string;

    return { auth, asManager, workspaceId, taskFor, proofOn };
  }

  it("refuses until an owner lends the power", async () => {
    const ctx = await team();
    const validationId = await ctx.proofOn(await ctx.taskFor("worker"));

    await ctx
      .asManager(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "START" })
      .expect(403);
  });

  it("lets the manager pronounce on its team's work once lent", async () => {
    const ctx = await team();
    const validationId = await ctx.proofOn(await ctx.taskFor("worker"));

    await ctx
      .auth(request(http).patch(`/workspaces/${ctx.workspaceId}`))
      .send({ settings: { automation: { managerJudgesItsTeam: true } } })
      .expect(200);

    await ctx
      .asManager(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "START" })
      .expect(200);
    await ctx
      .asManager(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "SUCCEEDED" })
      .expect(200);

    const settled = await prisma.validation.findUnique({ where: { id: validationId } });
    expect(settled?.status).toBe("SUCCEEDED");
    expect(settled?.executedById).toBe("manager");
  });

  /**
   * §10.9 itself, and no switch reaches it. A manager works too — it is an
   * agent with tasks of its own — and the moment it may pronounce on its
   * team's work is the moment somebody has to make sure it cannot pronounce
   * on its own.
   */
  it("never lets an agent pronounce on a task assigned to itself", async () => {
    const ctx = await team();
    const validationId = await ctx.proofOn(await ctx.taskFor("manager"));

    await ctx
      .auth(request(http).patch(`/workspaces/${ctx.workspaceId}`))
      .send({ settings: { automation: { managerJudgesItsTeam: true } } })
      .expect(200);

    await ctx
      .asManager(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "START" })
      .expect(403);
  });

  /** A person is never affected by any of this. */
  it("leaves a human free to pronounce on anything, switch or no switch", async () => {
    const ctx = await team();
    const validationId = await ctx.proofOn(await ctx.taskFor("worker"));

    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "START" })
      .expect(200);
  });
});
