import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { resetDatabase } from "./setup/reset-database";

/**
 * §9 — the hub hands out work nobody clicked on, and the ceiling that makes
 * that survivable.
 *
 * Everything worth testing here is a refusal. A dispatcher that only knows
 * how to say yes is a way to spend a night by accident, so what this file
 * proves is: off unless asked, bounded when on, and quiet about it.
 */
describe("Automatic dispatch (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  const password = "a-strong-password";

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

  async function setup(automation?: Record<string, unknown>) {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "o@example.com", password, displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "o@example.com", password })
      .expect(200);
    const organizationId = registered.body.organizationId as string;
    const auth = (r: request.Test) =>
      r.set("Authorization", `Bearer ${logged.body.accessToken}`);
    const ws = await auth(request(http).post("/workspaces"))
      .send({
        organizationId,
        name: "Core",
        ...(automation ? { settings: { automation } } : {}),
      })
      .expect(201);
    const workspaceId = ws.body.workspaceId as string;

    await app.get(IssueActorCredentialUseCase).execute({
      actorType: "AGENT",
      actorId: "worker-agent",
      organizationId,
      displayName: "Raphaël",
    });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "worker-agent",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship it", successCriteria: ["it shipped"] })
      .expect(201);

    return { auth, workspaceId, goalId: goal.body.goalId as string };
  }

  const makeTask = (ctx: Awaited<ReturnType<typeof setup>>, title: string) =>
    ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
      .send({
        goalId: ctx.goalId,
        title,
        acceptanceCriteria: ["done"],
        assigneeType: "AGENT",
        assigneeId: "worker-agent",
      })
      .expect(201);

  const runsIn = async (ctx: Awaited<ReturnType<typeof setup>>) =>
    (await ctx.auth(request(http).get(`/workspaces/${ctx.workspaceId}/runs`)).expect(200))
      .body as unknown[];

  it("does nothing at all until a workspace turns it on", async () => {
    const ctx = await setup();

    await makeTask(ctx, "Nobody asked for this to start");

    expect(await runsIn(ctx)).toEqual([]);
  });

  /**
   * With no machine attached there is nothing to run on, and that is the
   * ordinary state of a workspace somebody has just switched automation on
   * in. It must be a quiet refusal, not a failure of the request that created
   * the task — the person creating a task did not ask for a dispatch.
   */
  it("creating a task still succeeds when there is nothing to dispatch to", async () => {
    const ctx = await setup({ automatic: true });

    await makeTask(ctx, "There is no machine here");

    expect(await runsIn(ctx)).toEqual([]);
  });

  it("refuses to be told a ceiling of nonsense", async () => {
    const ctx = await setup({
      automatic: true,
      concurrentRuns: "as many as you like",
      runsPerDay: -1,
    });

    // The settings survive as written — the bag is the operator's — but what
    // is READ from them is bounded, so a typo cannot mean "no limit".
    const workspace = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}`))
      .expect(200);
    expect(workspace.body.settings.automation.concurrentRuns).toBe("as many as you like");

    await makeTask(ctx, "Still bounded");
    expect(await runsIn(ctx)).toEqual([]);
  });
});
