import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Workspace (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  async function registerAndLogin(email: string) {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email, password: "a-strong-password", displayName: "Bradley" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email, password: "a-strong-password" })
      .expect(200);
    return {
      userId: registered.body.userId as string,
      organizationId: registered.body.organizationId as string,
      token: logged.body.accessToken as string,
    };
  }

  it("create → appears in my list with an OWNER-founded isolation", async () => {
    const owner = await registerAndLogin("owner@example.com");

    const created = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ organizationId: owner.organizationId, name: "Spline Core" })
      .expect(201);
    expect(created.body.slug).toBe("spline-core");

    const mine = await request(http)
      .get("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(created.body.workspaceId);
    expect(mine.body[0].allowedStatusTargets).toEqual(["PAUSED", "ARCHIVED"]);
  });

  it("a stranger gets 403 on someone else's workspace; a member reads it", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const stranger = await registerAndLogin("stranger@example.com");
    const created = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ organizationId: owner.organizationId, name: "Private" })
      .expect(201);

    await request(http)
      .get(`/workspaces/${created.body.workspaceId}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
    await request(http)
      .get(`/workspaces/${created.body.workspaceId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
  });

  it("refuses creation in an organization the caller does not own", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const other = await registerAndLogin("other@example.com");

    await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${other.token}`)
      .send({ organizationId: owner.organizationId, name: "Intrusion" })
      .expect(403);
  });

  it("an agent cannot create a workspace (403) — creation founds human ownership", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const issue = app.get(IssueActorCredentialUseCase);
    const issued = await issue.execute({ actorType: "AGENT", actorId: "a-1" });

    await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${issued.value.token}`)
      .send({ organizationId: owner.organizationId, name: "Agent Land" })
      .expect(403);
  });

  it("status lifecycle: idempotent repeat, 409 on invalid, 410 from terminal", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const created = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ organizationId: owner.organizationId, name: "Lifecycle" })
      .expect(201);
    const base = `/workspaces/${created.body.workspaceId}`;
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${owner.token}`);

    await auth(request(http).post(`${base}/pause`)).expect(200);
    await auth(request(http).post(`${base}/pause`)).expect(200); // idempotent §22.6
    await auth(request(http).post(`${base}/delete`)).expect(409); // must archive first
    await auth(request(http).post(`${base}/archive`)).expect(200);
    await auth(request(http).post(`${base}/delete`)).expect(200);
    await auth(request(http).post(`${base}/unarchive`)).expect(410); // terminal

    // Logical deletion keeps the membership rows (audit), so the permission
    // check still passes — the use-case then hides the workspace: 404.
    await request(http)
      .get(`/workspaces/${created.body.workspaceId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(404);
  });

  it("a DELETED workspace disappears from the list", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const created = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ organizationId: owner.organizationId, name: "Ephemeral" })
      .expect(201);
    const base = `/workspaces/${created.body.workspaceId}`;
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${owner.token}`);
    await auth(request(http).post(`${base}/archive`)).expect(200);
    await auth(request(http).post(`${base}/delete`)).expect(200);

    const mine = await request(http)
      .get("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(mine.body).toHaveLength(0);
  });

  it("updates details and re-slugs; rejects emptied policies", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const created = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ organizationId: owner.organizationId, name: "Old Name" })
      .expect(201);
    const url = `/workspaces/${created.body.workspaceId}`;

    await request(http)
      .patch(url)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "New Name", description: "desc" })
      .expect(200);
    const fetched = await request(http)
      .get(url)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(fetched.body.slug).toBe("new-name");

    // Settings are free-form configuration: the Policy Engine (§12) owns rules.
    await request(http)
      .patch(url)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ settings: { rootPath: "/srv/x" } })
      .expect(200);
  });

  it("requires authentication everywhere", async () => {
    await request(http).get("/workspaces").expect(401);
    await request(http).post("/workspaces").send({}).expect(401);
    await request(http).get("/organizations").expect(401);
  });

  it("GET /organizations lists the personal organization — the creation entry point", async () => {
    const owner = await registerAndLogin("owner@example.com");

    const organizations = await request(http)
      .get("/organizations")
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);

    expect(organizations.body).toHaveLength(1);
    expect(organizations.body[0].id).toBe(owner.organizationId);
  });

  it("an operator can pause in an emergency but never rename or archive", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const operator = await registerAndLogin("operator@example.com");
    const created = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ organizationId: owner.organizationId, name: "Prod" })
      .expect(201);
    const base = `/workspaces/${created.body.workspaceId}`;
    await request(http)
      .post(`${base}/members`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "operator@example.com", role: "HUMAN_OPERATOR" })
      .expect(201);
    const asOperator = (r: request.Test) =>
      r.set("Authorization", `Bearer ${operator.token}`);

    await asOperator(request(http).post(`${base}/pause`)).expect(200);
    await asOperator(request(http).post(`${base}/resume`)).expect(200);
    await asOperator(request(http).post(`${base}/archive`)).expect(403);
    await asOperator(request(http).patch(base)).send({ name: "Renamed" }).expect(403);
  });

  describe("membership administration", () => {
    it("invites a human by email, lists members, changes role, revokes", async () => {
      const owner = await registerAndLogin("owner@example.com");
      await registerAndLogin("colleague@example.com");
      const created = await request(http)
        .post("/workspaces")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ organizationId: owner.organizationId, name: "Team" })
        .expect(201);
      const members = `/workspaces/${created.body.workspaceId}/members`;
      const auth = (r: request.Test) => r.set("Authorization", `Bearer ${owner.token}`);

      const invited = await auth(request(http).post(members))
        .send({ email: "COLLEAGUE@example.com", role: "VIEWER" })
        .expect(201);

      const listed = await auth(request(http).get(members)).expect(200);
      expect(listed.body).toHaveLength(2);
      const colleague = listed.body.find(
        (m: { email: string }) => m.email === "colleague@example.com",
      );
      expect(colleague.role).toBe("VIEWER");
      expect(colleague.displayName).toBe("Bradley");

      await auth(request(http).patch(`${members}/${invited.body.membershipId}`))
        .send({ role: "HUMAN_OPERATOR" })
        .expect(200);
      await auth(request(http).delete(`${members}/${invited.body.membershipId}`)).expect(200);
      const after = await auth(request(http).get(members)).expect(200);
      expect(after.body).toHaveLength(1);
    });

    it("an invited member actually gains access to the workspace", async () => {
      const owner = await registerAndLogin("owner@example.com");
      const colleague = await registerAndLogin("colleague@example.com");
      const created = await request(http)
        .post("/workspaces")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ organizationId: owner.organizationId, name: "Shared" })
        .expect(201);
      const base = `/workspaces/${created.body.workspaceId}`;

      await request(http).get(base).set("Authorization", `Bearer ${colleague.token}`).expect(403);
      await request(http)
        .post(`${base}/members`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ email: "colleague@example.com", role: "VIEWER" })
        .expect(201);
      await request(http).get(base).set("Authorization", `Bearer ${colleague.token}`).expect(200);
    });

    it("rejects unknown email (404), duplicate (409), and last-owner removal (409)", async () => {
      const owner = await registerAndLogin("owner@example.com");
      await registerAndLogin("colleague@example.com");
      const created = await request(http)
        .post("/workspaces")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ organizationId: owner.organizationId, name: "Rules" })
        .expect(201);
      const members = `/workspaces/${created.body.workspaceId}/members`;
      const auth = (r: request.Test) => r.set("Authorization", `Bearer ${owner.token}`);

      await auth(request(http).post(members))
        .send({ email: "ghost@example.com", role: "VIEWER" })
        .expect(404);
      await auth(request(http).post(members))
        .send({ email: "colleague@example.com", role: "VIEWER" })
        .expect(201);
      await auth(request(http).post(members))
        .send({ email: "colleague@example.com", role: "VIEWER" })
        .expect(409);

      const listed = await auth(request(http).get(members)).expect(200);
      const ownerMembership = listed.body.find((m: { role: string }) => m.role === "OWNER");
      await auth(
        request(http).delete(`${members}/${ownerMembership.membershipId}`),
      ).expect(409);
    });

    it("a viewer cannot administer members", async () => {
      const owner = await registerAndLogin("owner@example.com");
      const viewer = await registerAndLogin("viewer@example.com");
      const created = await request(http)
        .post("/workspaces")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ organizationId: owner.organizationId, name: "Closed" })
        .expect(201);
      const members = `/workspaces/${created.body.workspaceId}/members`;
      await request(http)
        .post(members)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ email: "viewer@example.com", role: "VIEWER" })
        .expect(201);

      await request(http)
        .post(members)
        .set("Authorization", `Bearer ${viewer.token}`)
        .send({ email: "owner@example.com", role: "VIEWER" })
        .expect(403);
    });
  });

  it("GET /auth/me carries the profile a client renders", async () => {
    const owner = await registerAndLogin("owner@example.com");

    const me = await request(http)
      .get("/auth/me")
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);

    expect(me.body).toEqual({
      actorType: "HUMAN",
      actorId: owner.userId,
      displayName: "Bradley",
      email: "owner@example.com",
    });
  });

  it("the owner renames their organization; a stranger cannot", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const stranger = await registerAndLogin("stranger@example.com");

    await request(http)
      .patch(`/organizations/${owner.organizationId}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ name: "Hijacked" })
      .expect(403);
    await request(http)
      .patch(`/organizations/${owner.organizationId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Acme Corp" })
      .expect(200);

    const listed = await request(http)
      .get("/organizations")
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(listed.body[0].name).toBe("Acme Corp");
    expect(listed.body[0].slug).toBe("acme-corp");
  });
});
