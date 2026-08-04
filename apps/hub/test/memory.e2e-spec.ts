import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Memory (e2e)", () => {
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

    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const goal = await auth(request(http).post(`/workspaces/${workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);

    return {
      token,
      auth,
      organizationId,
      workspaceId,
      goalId: goal.body.goalId as string,
      base: `/workspaces/${workspaceId}/memory`,
    };
  }

  /**
   * §16.2 read the opposite way round to §12.2: a task-level policy REPLACES
   * the workspace's, a task-level note is ADDED to it. Same-looking hierarchy,
   * opposite semantics — the mistake this test exists to prevent.
   */
  it("stacks every level of context instead of letting the most specific win", async () => {
    const ctx = await setup();
    for (const [scopeType, scopeId, title] of [
      ["ORGANIZATION", ctx.organizationId, "we deploy on Fridays"],
      ["WORKSPACE", ctx.workspaceId, "branch naming is feature/<slug>"],
      ["GOAL", ctx.goalId, "the migration must be reversible"],
    ] as const) {
      await ctx
        .auth(request(http).post(ctx.base))
        .send({ scopeType, scopeId, type: "convention", title, content: title })
        .expect(201);
    }

    const context = await ctx
      .auth(
        request(http).get(
          `${ctx.base}/context?organizationId=${ctx.organizationId}&goalId=${ctx.goalId}`,
        ),
      )
      .expect(200);

    expect(context.body.levels.map((l: { scope: { type: string } }) => l.scope.type)).toEqual(
      ["ORGANIZATION", "WORKSPACE", "GOAL"],
    );
    expect(
      context.body.levels.flatMap((l: { entries: unknown[] }) => l.entries),
    ).toHaveLength(3);
    expect(context.body.levels[0].truncated).toBe(false);
  });

  /**
   * §16's opening line. An entry that both points at a decision and repeats
   * its content is a second version of that decision, which ages silently.
   */
  it("refuses an entry that is both a reference and a copy of what it references", async () => {
    const ctx = await setup();
    const decision = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/decisions`))
      .send({ subject: "Postgres over SQLite", rationale: "we need concurrency", outcome: "postgres" })
      .expect(201);

    await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "decision",
        title: "Postgres over SQLite",
        content: "we need concurrency",
        sourceType: "decision",
        sourceId: decision.body.decisionId,
      })
      .expect(400);

    // Neither one nor the other is refused too.
    await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "note",
        title: "an empty thought",
      })
      .expect(400);
  });

  /** §16.1 "versionnée" — corrected by supersession, never overwritten. */
  it("corrects a note without erasing what was believed before", async () => {
    const ctx = await setup();
    const first = await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "convention",
        title: "Branch naming",
        content: "feature/<ticket>-<slug>",
      })
      .expect(201);

    await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "convention",
        title: "Branch naming",
        content: "feat/<slug>",
        supersedes: first.body.entryId,
      })
      .expect(201);

    const current = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(current.body).toHaveLength(1);
    expect(current.body[0].content).toBe("feat/<slug>");

    const withHistory = await ctx
      .auth(request(http).get(`${ctx.base}?includeSuperseded=true`))
      .expect(200);
    expect(withHistory.body).toHaveLength(2);
  });

  /**
   * §16.10, and the proof of the module's central claim: if dropping the
   * table were lossy, this operation could not exist.
   */
  it("rebuilds itself from the domain, and says what it could not rebuild", async () => {
    const ctx = await setup();
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/decisions`))
      .send({ subject: "Postgres over SQLite", rationale: "concurrency", outcome: "postgres" })
      .expect(201);
    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/artifacts`))
      .send({ name: "Architecture diagram", type: "DOCUMENT", checksum: "c1", storageRef: "s1" })
      .expect(201);

    // Wipe it entirely — nothing in the domain depends on it.
    await prisma.memoryEntry.deleteMany({ where: { workspaceId: ctx.workspaceId } });

    const report = await ctx
      .auth(request(http).post(`${ctx.base}/reconstruct`))
      .expect(200);

    expect(report.body.posed).toBe(2);
    expect(report.body.notReconstructed.length).toBeGreaterThan(0);

    const rebuilt = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(rebuilt.body.map((e: { type: string }) => e.type).sort()).toEqual([
      "artifact",
      "decision",
    ]);
    // References, never copies: the rationale stays in the decision.
    expect(rebuilt.body.every((e: { content: null }) => e.content === null)).toBe(true);
    expect(rebuilt.body[0].source.id).toBeDefined();

    // Idempotent: running it again poses nothing new.
    const again = await ctx
      .auth(request(http).post(`${ctx.base}/reconstruct`))
      .expect(200);
    expect(again.body.posed).toBe(0);
    expect(again.body.alreadyPresent).toBe(2);
  });

  it("forgets a note safely, and searches by the index of §16.9", async () => {
    const ctx = await setup();
    const kept = await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "convention",
        title: "kept",
        content: "still true",
        tags: ["git"],
      })
      .expect(201);
    await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "scratch",
        title: "dropped",
        content: "was wrong",
      })
      .expect(201);

    expect((await ctx.auth(request(http).get(`${ctx.base}?tag=git`))).body).toHaveLength(1);
    expect(
      (await ctx.auth(request(http).get(`${ctx.base}?type=scratch`))).body,
    ).toHaveLength(1);

    const dropped = (await ctx.auth(request(http).get(`${ctx.base}?type=scratch`))).body[0];
    await ctx.auth(request(http).post(`${ctx.base}/${dropped.id}/forget`)).expect(200);

    const left = await ctx.auth(request(http).get(ctx.base)).expect(200);
    expect(left.body).toHaveLength(1);
    expect(left.body[0].id).toBe(kept.body.entryId);
  });

  it("never reaches another workspace's memory", async () => {
    const ctx = await setup();
    const other = await ctx
      .auth(request(http).post("/workspaces"))
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);
    const entry = await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "note",
        title: "mine",
        content: "mine",
      })
      .expect(201);

    await ctx
      .auth(
        request(http).post(
          `/workspaces/${other.body.workspaceId}/memory/${entry.body.entryId}/forget`,
        ),
      )
      .expect(404);
    expect(
      (await ctx.auth(request(http).get(`/workspaces/${other.body.workspaceId}/memory`)))
        .body,
    ).toHaveLength(0);
  });

  /**
   * The matrix says a VIEWER only reads. It was true of the matrix and false
   * of the system: writing memory was guarded by `read_workspace_state`, so
   * the one role named for observing could add to a workspace's memory.
   */
  it("lets a viewer read the memory and never write to it", async () => {
    const ctx = await setup();
    await request(http)
      .post("/auth/register")
      .send({ email: "v@example.com", password: "a-strong-password", displayName: "V" })
      .expect(201);
    const viewer = await request(http)
      .post("/auth/login")
      .send({ email: "v@example.com", password: "a-strong-password" })
      .expect(200);
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "HUMAN",
      actorId: viewer.body.userId,
      workspaceId: ctx.workspaceId,
      role: "VIEWER",
    });
    const asViewer = (r: request.Test) =>
      r.set("Authorization", `Bearer ${viewer.body.accessToken}`);

    await asViewer(request(http).get(ctx.base)).expect(200);
    await asViewer(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "note",
        title: "not mine to write",
        content: "x",
      })
      .expect(403);

    // An agent that observes and reports still may — same category as
    // recording a decision.
    const issued = await app
      .get(IssueActorCredentialUseCase)
      .execute({ actorType: "AGENT", actorId: "a-reader" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-reader",
      workspaceId: ctx.workspaceId,
      role: "READ_ONLY_AGENT",
    });
    await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${issued.value.token}`)
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "observation",
        title: "the build is flaky",
        content: "three retries in a row",
      })
      .expect(201);
  });

  /** An identifier the API hands out must be resolvable through the API. */
  it("resolves the entry a supersession points at", async () => {
    const ctx = await setup();
    const first = await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "convention",
        title: "old",
        content: "old",
      })
      .expect(201);
    await ctx
      .auth(request(http).post(ctx.base))
      .send({
        scopeType: "WORKSPACE",
        scopeId: ctx.workspaceId,
        type: "convention",
        title: "new",
        content: "new",
        supersedes: first.body.entryId,
      })
      .expect(201);

    const superseded = await ctx
      .auth(request(http).get(`${ctx.base}/${first.body.entryId}`))
      .expect(200);
    const successor = await ctx
      .auth(request(http).get(`${ctx.base}/${superseded.body.supersededById}`))
      .expect(200);

    expect(successor.body.title).toBe("new");
    await ctx.auth(request(http).get(`${ctx.base}/nope`)).expect(404);
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
