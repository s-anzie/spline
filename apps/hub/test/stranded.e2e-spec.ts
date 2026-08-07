import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AutoDispatchListener } from "../src/modules/runtime/application/auto-dispatch.listener";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { resetDatabase } from "./setup/reset-database";

/**
 * §9 — work that was refused once must not be refused forever.
 *
 * Automatic dispatch fired on `task.created` and `task.assigned` and nowhere
 * else, so every reason it could decline stranded the task permanently:
 *
 *   - no provider in the catalogue yet (the ordinary state of a fresh
 *     install, since nothing ever wrote that table),
 *   - the concurrency ceiling already reached,
 *   - the daily ceiling already reached,
 *   - no machine attached at that instant.
 *
 * All four are TEMPORARY. All four produced a permanent stall. A workspace
 * with automation on, a machine online, an agent assigned and a task READY
 * sat at zero commands, and the only trace was one line in a log.
 *
 * The event stays — it is what makes dispatch immediate. What this adds is
 * the second look, so that "not now" stops meaning "never".
 */
describe("Work refused once is looked at again (e2e)", () => {
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

  it("dispatches a task that was ready before any provider existed", async () => {
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

    // An organization is born with its owner; there is no route to make one.
    const organizationId = registered.body.organizationId as string;
    const workspaceId = (
      await auth(request(http).post("/workspaces"))
        .send({ organizationId, name: "W" })
        .expect(201)
    ).body.workspaceId as string;

    // Automation on, and a machine — but NO provider yet. This is the exact
    // state of a fresh install the moment somebody asks for work.
    await auth(request(http).patch(`/workspaces/${workspaceId}`))
      .send({ settings: { automation: { automatic: true } } })
      .expect(200);

    // The agent has to exist and belong here before work can be assigned to it.
    await app
      .get(IssueActorCredentialUseCase)
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId, displayName: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

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
        })
        .expect(201)
    ).body.taskId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/tasks/${taskId}/status`))
      .send({ status: "READY" })
      .expect(200);

    // Nothing could have run: there was no provider to run it with.
    expect(
      await prisma.runtimeCommand.count({ where: { workspaceId } }),
    ).toBe(0);

    // Now a machine arrives and announces what it can drive — which is what
    // fills the catalogue. In real life this is a daemon starting up, minutes
    // or hours after somebody asked for the work.
    const workerId = (
      await auth(request(http).post("/runtime/workers"))
        .send({
          hostname: "late-arrival",
          architecture: "x86_64",
          operatingSystem: "linux",
          providers: ["claude"],
        })
        .expect(201)
    ).body.workerId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/runtime/workers`))
      .send({ workerId })
      .expect(200);

    // No sweep is called here on purpose: attaching the machine raised the
    // event, and the listener did the rest. If this ever needs a manual push
    // again, the automatic path has broken.
    expect(await prisma.runtimeCommand.count({ where: { workspaceId } })).toBe(1);

    /**
     * And no more, however often it is asked.
     *
     * This is the failure the second look could easily have introduced, and
     * it is worse than the stall it fixes. Dispatching does NOT move a task
     * out of READY — it stays ready while its run works — so a sweep that
     * trusted the status alone would start another run on every trigger, and
     * a machine heartbeats every thirty seconds.
     */
    await app.get(AutoDispatchListener).sweep(workspaceId);
    await app.get(AutoDispatchListener).sweep(workspaceId);

    expect(await prisma.runtimeCommand.count({ where: { workspaceId } })).toBe(1);
  });

  /**
   * The case that mattered most, and the one that did not fire.
   *
   * A machine that already exists takes the upsert path on registration, and
   * that path raised no event at all — so a daemon RESTARTING was invisible
   * to everything listening. Which is precisely what an operator does when
   * they have just been told the fix is in: they restart their worker, and
   * nothing happens, again.
   */
  it("picks up waiting work when a known machine comes back", async () => {
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
    await auth(request(http).patch(`/workspaces/${workspaceId}`))
      .send({ settings: { automation: { automatic: true } } })
      .expect(200);

    await app
      .get(IssueActorCredentialUseCase)
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId, displayName: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    const announce = (providers: string[]) =>
      auth(request(http).post("/runtime/workers"))
        .send({
          hostname: "salsa-013",
          architecture: "x86_64",
          operatingSystem: "linux",
          providers,
        })
        .expect(201);

    // The machine exists and is attached, but announces nothing it can drive:
    // the catalogue stays empty and the work cannot go anywhere.
    const workerId = (await announce([])).body.workerId as string;
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
        })
        .expect(201)
    ).body.taskId as string;
    await auth(request(http).post(`/workspaces/${workspaceId}/tasks/${taskId}/status`))
      .send({ status: "READY" })
      .expect(200);

    expect(await prisma.runtimeCommand.count({ where: { workspaceId } })).toBe(0);

    // The operator restarts the daemon, now able to drive claude. Same
    // hostname, so the same machine — the upsert path.
    await announce(["claude"]);

    expect(await prisma.runtimeCommand.count({ where: { workspaceId } })).toBe(1);
  });
});
