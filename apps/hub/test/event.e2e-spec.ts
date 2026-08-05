import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Event (e2e)", () => {
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
      .execute({ actorType: "AGENT", actorId: "a-1", organizationId: registered.body.organizationId as string, displayName: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    return {
      token,
      agentToken: issued.value.token,
      organizationId: registered.body.organizationId as string,
      workspaceId,
      base: `/workspaces/${workspaceId}/events`,
    };
  }

  /**
   * The point of the module: facts produced by ordinary work are on record,
   * without any module having asked for it.
   */
  it("ordinary work leaves a durable, ordered journal behind it", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    await auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);

    const journal = await auth(request(http).get(ctx.base)).expect(200);

    const types = journal.body.map((e: { type: string }) => e.type);
    expect(types).toContain("goal.created");
    const created = journal.body.find((e: { type: string }) => e.type === "goal.created");
    expect(created.target.type).toBe("goal");
    expect(created.severity).toBe("INFO");
    expect(created.workspaceId).toBe(ctx.workspaceId);
    // Ordered by a real sequence, not by timestamp.
    const sequences = journal.body.map((e: { sequence: string }) => Number(e.sequence));
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });

  it("severity is assigned by convention, so alerts have something to read", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const goal = await auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["c"] })
      .expect(201);
    const tasks = `/workspaces/${ctx.workspaceId}/tasks`;
    const task = await auth(request(http).post(tasks))
      .send({
        goalId: goal.body.goalId,
        title: "T",
        acceptanceCriteria: ["c"],
        assigneeType: "AGENT",
        assigneeId: "a-1",
      })
      .expect(201);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
      await asAgent(request(http).post(`${tasks}/${task.body.taskId}/status`))
        .send({ status })
        .expect(200);
    }
    await asAgent(request(http).post(`${tasks}/${task.body.taskId}/blockers`))
      .send({ type: "TECHNICAL", description: "port bound" })
      .expect(201);

    const warnings = await auth(
      request(http).get(`${ctx.base}?severity=WARNING`),
    ).expect(200);
    expect(warnings.body.map((e: { type: string }) => e.type)).toContain(
      "task.blocker_reported",
    );
  });

  it("replays forward from a known position (§14.5)", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    await auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "First", successCriteria: ["c"] })
      .expect(201);
    const before = await auth(request(http).get(ctx.base)).expect(200);
    const mark = before.body[before.body.length - 1].sequence;

    await auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Second", successCriteria: ["c"] })
      .expect(201);

    const since = await auth(
      request(http).get(`${ctx.base}?afterSequence=${mark}`),
    ).expect(200);
    expect(since.body.length).toBeGreaterThan(0);
    expect(
      since.body.every((e: { sequence: string }) => Number(e.sequence) > Number(mark)),
    ).toBe(true);
  });

  it("an agent records a fact of its own (§6.8)", async () => {
    const ctx = await setup();

    const recorded = await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .send({
        type: "agent.observation",
        targetType: "agent",
        targetId: "a-1",
        severity: "WARNING",
        payload: { note: "the build is flaky" },
      })
      .expect(201);
    expect(Number(recorded.body.sequence)).toBeGreaterThan(0);

    const journal = await request(http)
      .get(`${ctx.base}?type=agent.observation`)
      .set("Authorization", `Bearer ${ctx.token}`)
      .expect(200);
    expect(journal.body[0].actor).toEqual({ type: "AGENT", id: "a-1" });
    expect(journal.body[0].payload.note).toBe("the build is flaky");
  });

  it("acknowledgement is individual: required, then declared by the actor alone", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const recorded = await auth(request(http).post(ctx.base))
      .send({ type: "policy.changed", targetType: "workspace", targetId: ctx.workspaceId })
      .expect(201);
    const eventId = recorded.body.eventId as string;

    await auth(request(http).post(`${ctx.base}/${eventId}/receipts`))
      .send({ actorType: "AGENT", actorIds: ["a-1"] })
      .expect(201);

    // Asking twice must not create a second receipt for the same actor.
    await auth(request(http).post(`${ctx.base}/${eventId}/receipts`))
      .send({ actorType: "AGENT", actorIds: ["a-1"] })
      .expect(201);

    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    let mine = await asAgent(request(http).get(`/workspaces/${ctx.workspaceId}/event-receipts/mine`)).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].status).toBe("PENDING");
    expect(mine.body[0].allowedStatusTargets).toEqual(["SEEN"]);
    expect(mine.body[0].event.type).toBe("policy.changed");

    // Skipping a step is refused; the progression is strict.
    await asAgent(request(http).post(`${ctx.base}/${eventId}/receipts/mine`))
      .send({ status: "ACTED" })
      .expect(409);

    for (const status of ["SEEN", "ACKNOWLEDGED", "ACTED"] as const) {
      await asAgent(request(http).post(`${ctx.base}/${eventId}/receipts/mine`))
        .send({ status })
        .expect(200);
    }

    mine = await asAgent(request(http).get(`/workspaces/${ctx.workspaceId}/event-receipts/mine`)).expect(200);
    expect(mine.body).toHaveLength(0); // settled, out of the queue
  });

  /**
   * §4.2 / §20.4: workspace isolation admits no exception, not even for a
   * "what do I still owe an answer to?" query. An actor who belongs to two
   * workspaces must never receive one list mixing both.
   */
  it("never mixes two workspaces in an actor's own pending receipts", async () => {
    const ctx = await setup();

    const second = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${ctx.token}`)
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);
    const otherId = second.body.workspaceId as string;
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId: otherId,
      role: "AGENT_CONTRIBUTOR",
    });

    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);

    // One fact demanding an acknowledgement in each workspace.
    for (const [base, title] of [
      [ctx.base, "here"],
      [`/workspaces/${otherId}/events`, "elsewhere"],
    ] as const) {
      const created = await auth(request(http).post(base))
        .send({ type: "policy.changed", targetType: "policy", targetId: title })
        .expect(201);
      await auth(request(http).post(`${base}/${created.body.eventId}/receipts`))
        .send({ actorType: "AGENT", actorIds: ["a-1"] })
        .expect(201);
    }

    const here = await asAgent(
      request(http).get(`/workspaces/${ctx.workspaceId}/event-receipts/mine`),
    ).expect(200);
    expect(here.body).toHaveLength(1);
    expect(here.body[0].event.target.id).toBe("here");

    const elsewhere = await asAgent(
      request(http).get(`/workspaces/${otherId}/event-receipts/mine`),
    ).expect(200);
    expect(elsewhere.body).toHaveLength(1);
    expect(elsewhere.body[0].event.target.id).toBe("elsewhere");

    // The workspace in the URL must govern the object acted upon, not just the
    // permission check: acknowledging an "elsewhere" receipt through the "here"
    // URL would pass a guard for one workspace while touching another.
    const elsewhereEventId = elsewhere.body[0].eventId as string;
    await asAgent(
      request(http).post(`${ctx.base}/${elsewhereEventId}/receipts/mine`),
    )
      .send({ status: "SEEN" })
      .expect(404);

    // A workspace the agent is not a member of is refused outright.
    const outsider = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${ctx.token}`)
      .send({ organizationId: ctx.organizationId, name: "Closed" })
      .expect(201);
    await asAgent(
      request(http).get(
        `/workspaces/${outsider.body.workspaceId}/event-receipts/mine`,
      ),
    ).expect(403);
  });

  /**
   * A journal keeps every fact (§14.1) and nothing prunes it yet, so an
   * unfiltered read must not mean "give me everything": it returned the whole
   * journal of a workspace, which is harmless on day one and a way to take
   * the hub down later. Replay already pages with afterSequence (§14.5).
   */
  it("never returns an unbounded journal", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    for (let i = 0; i < 105; i++) {
      await auth(request(http).post(ctx.base))
        .send({ type: "agent.observation", targetType: "agent", targetId: `a-${i}` })
        .expect(201);
    }

    const page = await auth(request(http).get(ctx.base)).expect(200);
    expect(page.body).toHaveLength(100);

    // And the caller cannot ask for more than the ceiling.
    await auth(request(http).get(`${ctx.base}?limit=5000`)).expect(400);

    // Paging forward still reaches the rest (§14.5).
    const last = page.body[page.body.length - 1].sequence as string;
    const next = await auth(
      request(http).get(`${ctx.base}?afterSequence=${last}`),
    ).expect(200);
    expect(next.body.length).toBeGreaterThan(0);
  });

  it("isolates per workspace and requires authentication", async () => {
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
});
