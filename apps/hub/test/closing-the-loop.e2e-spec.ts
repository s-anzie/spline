import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §11, §4.24 — the end of the loop, which was missing entirely.
 *
 * A run reaching VALIDATING stayed there for ever: nothing in the application
 * layer ever called `run.complete()`, so the only caller of that method was a
 * unit test. An agent did its work, asked for proof exactly as §10.9 requires,
 * and the run sat at VALIDATING until somebody buried it for silence.
 *
 * From outside this looked like the agent had stalled. It had not — it had
 * finished, and there was nowhere for "finished" to go.
 */
describe("Work that passes its proof actually finishes (e2e)", () => {
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

  async function working() {
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

    await app
      .get(IssueActorCredentialUseCase)
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId, displayName: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    const workerId = (
      await auth(request(http).post("/runtime/workers"))
        .send({
          hostname: "box-1",
          architecture: "x86_64",
          operatingSystem: "linux",
          providers: ["claude"],
        })
        .expect(201)
    ).body.workerId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/runtime/workers`))
      .send({ workerId })
      .expect(200);

    const goalId = (
      await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
        .send({ title: "G", successCriteria: ["c"] })
        .expect(201)
    ).body.goalId as string;
    const taskId = (
      await auth(request(http).post(`/workspaces/${workspaceId}/tasks`))
        .send({
          goalId,
          title: "T",
          acceptanceCriteria: ["c"],
          assigneeType: "AGENT",
          assigneeId: "a-1",
          start: true,
        })
        .expect(201)
    ).body.taskId as string;

    // Dispatched, taken, and reported as done by the machine — which is where
    // §11 puts the run: VALIDATING, waiting on proof it may not grant itself.
    const runId = (
      await auth(request(http).post(`/workspaces/${workspaceId}/runtime/dispatch`))
        .send({ taskId, provider: "claude" })
        .expect(201)
    ).body.runId as string;
    const commandId = (
      (
        await auth(request(http).post(`/runtime/workers/${workerId}/commands/claim`))
          .send({ max: 1 })
          .expect(200)
      ).body as { id: string }[]
    )[0]!.id;
    await auth(
      request(http).post(`/runtime/workers/${workerId}/commands/${commandId}/report`),
    )
      // The machine reporting a completed order is what puts the run at
      // VALIDATING — §11: an agent that finished has not been believed yet.
      .send({ outcome: "COMPLETED", result: {} })
      .expect(200);

    return { auth, workspaceId, taskId, runId };
  }

  it("completes the run once the proof it was waiting on passes", async () => {
    const ctx = await working();
    expect(
      (await prisma.run.findUnique({ where: { id: ctx.runId } }))?.status,
    ).toBe("VALIDATING");

    const asked = await ctx
      .auth(
        request(http).post(`/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}/validations`),
      )
      .send({ validations: [{ type: "human_review", mandatory: true }] })
      .expect(201);
    const validationId = (asked.body as { validationIds: string[] }).validationIds[0];

    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "START" })
      .expect(200);
    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "SUCCEEDED" })
      .expect(200);

    const run = await prisma.run.findUnique({ where: { id: ctx.runId } });
    expect(run?.status).toBe("COMPLETED");
    expect(run?.finishedAt).not.toBeNull();
  });

  /**
   * §11 — proof that fails means the work is not done. The run fails with it,
   * so a retry is a new run rather than a second life for this one.
   */
  it("fails the run when its proof does not pass", async () => {
    const ctx = await working();
    const asked = await ctx
      .auth(
        request(http).post(`/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}/validations`),
      )
      .send({ validations: [{ type: "unit_test", mandatory: true }] })
      .expect(201);
    const validationId = (asked.body as { validationIds: string[] }).validationIds[0];

    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "START" })
      .expect(200);
    await ctx
      .auth(
        request(http).post(
          `/workspaces/${ctx.workspaceId}/validations/${validationId}/settle`,
        ),
      )
      .send({ action: "FAILED", output: "two tests are red" })
      .expect(200);

    const run = await prisma.run.findUnique({ where: { id: ctx.runId } });
    expect(run?.status).toBe("FAILED");
    expect(run?.failureReason).toContain("unit_test");
  });

  /**
   * A run waits on ALL of its mandatory proof. Completing on the first
   * verdict would let one green check finish work that two others still
   * refuse.
   */
  it("keeps waiting while another mandatory proof is outstanding", async () => {
    const ctx = await working();
    const asked = await ctx
      .auth(
        request(http).post(`/workspaces/${ctx.workspaceId}/tasks/${ctx.taskId}/validations`),
      )
      .send({
        validations: [
          { type: "unit_test", mandatory: true },
          { type: "human_review", mandatory: true },
        ],
      })
      .expect(201);
    const [first] = (asked.body as { validationIds: string[] }).validationIds;

    await ctx
      .auth(
        request(http).post(`/workspaces/${ctx.workspaceId}/validations/${first}/settle`),
      )
      .send({ action: "START" })
      .expect(200);
    await ctx
      .auth(
        request(http).post(`/workspaces/${ctx.workspaceId}/validations/${first}/settle`),
      )
      .send({ action: "SUCCEEDED" })
      .expect(200);

    expect(
      (await prisma.run.findUnique({ where: { id: ctx.runId } }))?.status,
    ).toBe("VALIDATING");
  });
});
