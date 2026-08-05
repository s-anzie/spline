import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Decision (e2e)", () => {
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

  /** An owner plus a READ_ONLY_AGENT — the role the permission matrix says may record. */
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
      .execute({ actorType: "AGENT", actorId: "observer", organizationId: registered.body.organizationId as string, displayName: "observer" });
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "observer",
      workspaceId,
      role: "READ_ONLY_AGENT",
    });

    return {
      token,
      observerToken: issued.value.token,
      workspaceId,
      base: `/workspaces/${workspaceId}/decisions`,
    };
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    subject: "Database engine",
    rationale: "JSONB and real transactions",
    outcome: "Use PostgreSQL",
    ...overrides,
  });

  it("records the reasoning with the alternatives that were weighed", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);

    const created = await auth(request(http).post(ctx.base))
      .send(
        body({
          confidence: "HIGH",
          alternatives: [{ option: "MySQL", rejectedBecause: "weaker JSON support" }],
        }),
      )
      .expect(201);

    const fetched = await auth(
      request(http).get(`${ctx.base}/${created.body.decisionId}`),
    ).expect(200);
    expect(fetched.body.outcome).toBe("Use PostgreSQL");
    expect(fetched.body.confidence).toBe("HIGH");
    expect(fetched.body.alternatives).toEqual([
      { option: "MySQL", rejectedBecause: "weaker JSON support" },
    ]);
    expect(fetched.body.isSuperseded).toBe(false);
  });

  it("a read-only agent may record a decision — it changes no state", async () => {
    const ctx = await setup();

    await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.observerToken}`)
      .send(body({ subject: "Observed trade-off" }))
      .expect(201);
  });

  it("supersession replaces without rewriting, and history stays readable", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const first = await auth(request(http).post(ctx.base)).send(body()).expect(201);

    const second = await auth(
      request(http).post(`${ctx.base}/${first.body.decisionId}/supersede`),
    )
      .send(body({ outcome: "Move to SQLite", rationale: "Our shape of data changed" }))
      .expect(201);

    // The old reasoning is still there, and it points at what replaced it.
    const old = await auth(
      request(http).get(`${ctx.base}/${first.body.decisionId}`),
    ).expect(200);
    expect(old.body.outcome).toBe("Use PostgreSQL");
    expect(old.body.supersededByDecisionId).toBe(second.body.decisionId);

    // Current view shows one; history shows both.
    const current = await auth(request(http).get(ctx.base)).expect(200);
    expect(current.body).toHaveLength(1);
    expect(current.body[0].outcome).toBe("Move to SQLite");
    const history = await auth(
      request(http).get(`${ctx.base}?includeSuperseded=true`),
    ).expect(200);
    expect(history.body).toHaveLength(2);
  });

  it("refuses to supersede twice, and leaves no orphan replacement behind", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const first = await auth(request(http).post(ctx.base)).send(body()).expect(201);
    const url = `${ctx.base}/${first.body.decisionId}/supersede`;
    await auth(request(http).post(url)).send(body({ outcome: "A" })).expect(201);

    await auth(request(http).post(url)).send(body({ outcome: "B" })).expect(409);

    const history = await auth(
      request(http).get(`${ctx.base}?includeSuperseded=true`),
    ).expect(200);
    expect(history.body).toHaveLength(2); // the refused replacement was never written
  });

  it("refuses a decision attached to a task that does not exist", async () => {
    const ctx = await setup();

    await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.token}`)
      .send(body({ taskId: "ghost" }))
      .expect(404);
  });

  it("an artifact can point at the decision that produced it (§15.3)", async () => {
    const ctx = await setup();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const decision = await auth(request(http).post(ctx.base)).send(body()).expect(201);
    const artifacts = `/workspaces/${ctx.workspaceId}/artifacts`;
    const artifact = await auth(request(http).post(artifacts))
      .send({
        type: "DOCUMENT",
        name: "ADR-001",
        checksum: "sha256:aaa",
        storageRef: "s3://bucket/adr",
      })
      .expect(201);

    await auth(request(http).post(`${artifacts}/${artifact.body.artifactId}/links`))
      .send({ decisionId: decision.body.decisionId })
      .expect(200);

    const fetched = await auth(
      request(http).get(`${artifacts}/${artifact.body.artifactId}`),
    ).expect(200);
    expect(fetched.body.decisionId).toBe(decision.body.decisionId);
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
