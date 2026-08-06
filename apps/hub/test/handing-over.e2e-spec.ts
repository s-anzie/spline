import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { resetDatabase } from "./setup/reset-database";

/**
 * §4.5, §4.6, §10.18a — handing a need to the team.
 *
 * The entry point is the one that already exists: you open a thread with
 * somebody and say what you need. Asking a MANAGER does what asking anybody
 * does, plus one thing — it puts them to work on it, and the thread is what
 * links your question to the work that answers it.
 *
 * The design decision this file records: the hub does NOT invent the goal.
 * A person writing "improve the document creation flow" has not said when it
 * is done, and success criteria are mandatory (§4.5) precisely so that
 * somebody has to. So the need becomes a task under a standing goal — the
 * workspace's requests — and stating the real goal, with real criteria, is
 * the manager's first job.
 */
describe("Handing a need to the team (e2e)", () => {
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

  async function workspace(role: "AGENT_MANAGER" | "AGENT_CONTRIBUTOR") {
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
      .send({ organizationId, name: "Core" })
      .expect(201);
    const workspaceId = ws.body.workspaceId as string;

    await app.get(IssueActorCredentialUseCase).execute({
      actorType: "AGENT",
      actorId: "manager-1",
      organizationId,
      displayName: "Edouarda",
    });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "manager-1",
      workspaceId,
      role,
    });

    return { auth, workspaceId, organizationId };
  }

  const NEED =
    "Improve the document creation flow, and take every piece of information it needs into account";

  it("turns the need into work the manager holds, and links the thread to it", async () => {
    const ctx = await workspace("AGENT_MANAGER");

    const opened = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/threads`))
      .send({
        participantType: "AGENT",
        participantId: "manager-1",
        subject: NEED,
        handOver: true,
      })
      .expect(201);

    expect(opened.body.threadId).toEqual(expect.any(String));
    // The thread delegates: that is what links your question to its answer.
    expect(opened.body.taskId).toEqual(expect.any(String));

    const thread = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/threads/${opened.body.threadId}`))
      .expect(200);
    expect(thread.body.taskId).toBe(opened.body.taskId);

    const task = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/tasks/${opened.body.taskId}`))
      .expect(200);
    expect(task.body.assignee).toMatchObject({ type: "AGENT", id: "manager-1" });
    // The need, unedited: the manager reads what the person actually wrote.
    expect(`${task.body.title} ${task.body.description ?? ""}`).toContain(
      "document creation flow",
    );
  });

  /**
   * The hub states no criteria on the person's behalf. What it opens is a
   * standing goal whose criterion is true of every request: it has been
   * turned into work, or answered.
   */
  it("puts it under the workspace's standing requests goal, not an invented one", async () => {
    const ctx = await workspace("AGENT_MANAGER");

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/threads`))
      .send({
        participantType: "AGENT",
        participantId: "manager-1",
        subject: NEED,
        handOver: true,
      })
      .expect(201);

    const goals = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/goals`))
      .expect(200);

    expect(goals.body).toHaveLength(1);
    expect(goals.body[0].successCriteria.length).toBeGreaterThan(0);
    // Not the need's own words: the need is the TASK, the goal is the standing
    // place requests live.
    expect(goals.body[0].title).not.toContain("document creation flow");
  });

  it("opens that goal once, however many needs are handed over", async () => {
    const ctx = await workspace("AGENT_MANAGER");

    for (const subject of ["First need", "Second need", "Third need"]) {
      await ctx
        .auth(request(http).post(`/workspaces/${ctx.workspaceId}/threads`))
        .send({
          participantType: "AGENT",
          participantId: "manager-1",
          subject,
          handOver: true,
        })
        .expect(201);
    }

    const goals = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/goals`))
      .expect(200);
    expect(goals.body).toHaveLength(1);

    const tasks = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/tasks`))
      .expect(200);
    expect(tasks.body).toHaveLength(3);
  });

  /**
   * §6.8 — the bug this test exists for.
   *
   * A task is born PLANNED, and only READY/ASSIGNED/RUNNING may be
   * dispatched. Handing a need over therefore produced work neither a person
   * nor the automatic dispatcher could start: it sat there looking created,
   * with nothing anywhere saying why nothing happened. Found on a real
   * workspace, not here.
   */
  it("leaves the work ready to run, not merely created", async () => {
    const ctx = await workspace("AGENT_MANAGER");

    const opened = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/threads`))
      .send({
        participantType: "AGENT",
        participantId: "manager-1",
        subject: NEED,
        handOver: true,
      })
      .expect(201);

    const task = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/tasks/${opened.body.taskId}`))
      .expect(200);

    // Anything a machine may be given work in. PLANNED is not one of them.
    expect(["READY", "ASSIGNED"]).toContain(task.body.status);
  });

  /**
   * §4.6 — you cannot hand organising to somebody who may not organise. The
   * refusal says so rather than creating work nobody can act on.
   */
  it("refuses to hand a need to somebody who cannot organise", async () => {
    const ctx = await workspace("AGENT_CONTRIBUTOR");

    const refused = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/threads`))
      .send({
        participantType: "AGENT",
        participantId: "manager-1",
        subject: NEED,
        handOver: true,
      })
      .expect(400);

    expect(refused.body.message).toMatch(/organis/i);
  });

  /** Asking without handing over is what it always was: a question. */
  it("leaves an ordinary question alone", async () => {
    const ctx = await workspace("AGENT_MANAGER");

    const opened = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/threads`))
      .send({
        participantType: "AGENT",
        participantId: "manager-1",
        subject: "Did the JWKS rotation ever land?",
      })
      .expect(201);

    expect(opened.body.taskId).toBeUndefined();
    const goals = await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/goals`))
      .expect(200);
    expect(goals.body).toEqual([]);
  });
});
