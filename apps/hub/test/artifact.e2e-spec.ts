import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Artifact (e2e)", () => {
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
      .execute({ actorType: "AGENT", actorId: "a-1" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId,
      role: "AGENT_CONTRIBUTOR",
    });

    return {
      token,
      agentToken: issued.value.token,
      workspaceId,
      base: `/workspaces/${workspaceId}/artifacts`,
    };
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    type: "REPORT",
    name: "Coverage",
    checksum: "sha256:aaa",
    storageRef: "s3://bucket/a",
    ...overrides,
  });

  it("an agent produces an artifact — producing traces is part of working", async () => {
    const ctx = await setup();

    const created = await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .send(body())
      .expect(201);

    const fetched = await request(http)
      .get(`${ctx.base}/${created.body.artifactId}`)
      .set("Authorization", `Bearer ${ctx.token}`)
      .expect(200);
    expect(fetched.body.currentVersion).toBe(1);
    expect(fetched.body.createdBy).toEqual({ type: "AGENT", id: "a-1" });
    expect(fetched.body.versions).toHaveLength(1);
    expect(fetched.body.allowedStatusTargets).toEqual(["ARCHIVED"]);
  });

  it("versions accumulate and older ones stay readable (§15.2)", async () => {
    const ctx = await setup();
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    const created = await asAgent(request(http).post(ctx.base)).send(body()).expect(201);
    const url = `${ctx.base}/${created.body.artifactId}`;

    const second = await asAgent(request(http).post(`${url}/versions`))
      .send({ checksum: "sha256:bbb", storageRef: "s3://bucket/b", note: "rerun" })
      .expect(201);
    expect(second.body.version).toBe(2);

    const fetched = await asAgent(request(http).get(url)).expect(200);
    expect(fetched.body.currentVersion).toBe(2);
    expect(fetched.body.versions.map((v: { checksum: string }) => v.checksum)).toEqual([
      "sha256:aaa",
      "sha256:bbb",
    ]);
    expect(fetched.body.versions[1].note).toBe("rerun");
  });

  it("an immutable artifact refuses new versions and edits (§15.7)", async () => {
    const ctx = await setup();
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    const created = await asAgent(request(http).post(ctx.base))
      .send(body({ immutable: true, type: "REPORT", name: "Validation report" }))
      .expect(201);
    const url = `${ctx.base}/${created.body.artifactId}`;

    await asAgent(request(http).post(`${url}/versions`))
      .send({ checksum: "c", storageRef: "s" })
      .expect(409);
    await asAgent(request(http).patch(url)).send({ name: "Rewritten" }).expect(409);

    // …but it can still be archived: immutability protects content, not lifecycle.
    await request(http)
      .post(`${url}/status`)
      .set("Authorization", `Bearer ${ctx.token}`)
      .send({ status: "ARCHIVED" })
      .expect(200);
  });

  it("accepts a type declared by an extension (§19.2)", async () => {
    const ctx = await setup();

    await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .send(body({ type: "SBOM" }))
      .expect(201);
    await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .send(body({ type: "not a type" }))
      .expect(400);
  });

  it("searches on the declared axes (§15.6)", async () => {
    const ctx = await setup();
    const asAgent = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.agentToken}`);
    await asAgent(request(http).post(ctx.base))
      .send(body({ name: "ci run", tags: ["ci", "nightly"] }))
      .expect(201);
    await asAgent(request(http).post(ctx.base))
      .send(body({ name: "a diff", type: "DIFF" }))
      .expect(201);

    const all = await asAgent(request(http).get(ctx.base)).expect(200);
    expect(all.body).toHaveLength(2);
    const diffs = await asAgent(request(http).get(`${ctx.base}?type=DIFF`)).expect(200);
    expect(diffs.body).toHaveLength(1);
    const tagged = await asAgent(request(http).get(`${ctx.base}?tag=nightly`)).expect(200);
    expect(tagged.body).toHaveLength(1);
    const byAuthor = await asAgent(
      request(http).get(`${ctx.base}?createdByType=AGENT&createdById=a-1`),
    ).expect(200);
    expect(byAuthor.body).toHaveLength(2);
  });

  it("links to a real goal then unlinks, and refuses a dangling link", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const goal = await auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);
    const created = await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .send(body())
      .expect(201);
    const url = `${ctx.base}/${created.body.artifactId}`;

    // A link must point at something real — otherwise the FK would 500.
    await auth(request(http).post(`${url}/links`)).send({ goalId: "ghost" }).expect(400);

    await auth(request(http).post(`${url}/links`))
      .send({ goalId: goal.body.goalId })
      .expect(200);
    expect((await auth(request(http).get(url)).expect(200)).body.goalId).toBe(
      goal.body.goalId,
    );

    await auth(request(http).post(`${url}/unlinks`)).send({ goal: true }).expect(200);
    expect((await auth(request(http).get(url)).expect(200)).body.goalId).toBeNull();
  });

  it("archives, deletes logically, and disappears from the default listing", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const created = await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.agentToken}`)
      .send(body())
      .expect(201);
    const url = `${ctx.base}/${created.body.artifactId}`;

    await auth(request(http).post(`${url}/status`)).send({ status: "DELETED" }).expect(409);
    await auth(request(http).post(`${url}/status`)).send({ status: "ARCHIVED" }).expect(200);
    await auth(request(http).post(`${url}/status`)).send({ status: "DELETED" }).expect(200);
    await auth(request(http).post(`${url}/status`)).send({ status: "ACTIVE" }).expect(410);

    expect((await auth(request(http).get(ctx.base)).expect(200)).body).toHaveLength(0);
    // Still there for audit when asked for explicitly.
    expect(
      (await auth(request(http).get(`${ctx.base}?status=DELETED`)).expect(200)).body,
    ).toHaveLength(1);
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
