import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §18.2 — the registry of non-human actors.
 *
 * Until this existed there was no way to create an AGENT at all: the only
 * thing that ever minted a non-human identity was machine pairing, which
 * mints a WORKER. A workspace could therefore only ever assign work to a
 * person — which is not what the product is for.
 */
describe("Actor registry (e2e)", () => {
  let app: INestApplication;
  let token: string;
  let organizationId: string;

  const owner = {
    email: "owner@example.com",
    password: "a-strong-password",
    displayName: "Owner",
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase(app.get(PrismaService));
    const registered = await request(app.getHttpServer())
      .post("/auth/register")
      .send(owner)
      .expect(201);
    organizationId = registered.body.organizationId;

    const logged = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    token = logged.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: "post" | "get", path: string) =>
    request(app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`);

  it("creates an agent identity and hands back its token exactly once", async () => {
    const created = await authed("post", `/organizations/${organizationId}/actors`)
      .send({ actorType: "AGENT", displayName: "Reviewer" })
      .expect(201);

    expect(created.body.actorId).toBeTruthy();
    expect(created.body.token).toMatch(/^agent_/);

    // The token is shown once and never again: only its hash is kept.
    const listed = await authed("get", `/organizations/${organizationId}/actors`).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      actorType: "AGENT",
      actorId: created.body.actorId,
      displayName: "Reviewer",
      revoked: false,
    });
    expect(JSON.stringify(listed.body)).not.toContain(created.body.token);
  });

  it("issues a credential the agent can actually authenticate with", async () => {
    const created = await authed("post", `/organizations/${organizationId}/actors`)
      .send({ actorType: "AGENT", displayName: "Reviewer" })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${created.body.token}`)
      .expect(200);

    expect(me.body).toMatchObject({
      actorType: "AGENT",
      actorId: created.body.actorId,
    });
  });

  /** A revoked identity is refused everywhere, immediately. */
  it("revokes a credential", async () => {
    const created = await authed("post", `/organizations/${organizationId}/actors`)
      .send({ actorType: "AGENT", displayName: "Reviewer" })
      .expect(201);

    await authed(
      "post",
      `/organizations/${organizationId}/actors/${created.body.credentialId}/revoke`,
    ).expect(200);

    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${created.body.token}`)
      .expect(401);

    const listed = await authed("get", `/organizations/${organizationId}/actors`).expect(200);
    expect(listed.body[0].revoked).toBe(true);
  });

  /**
   * The registry is where a non-human actor's name lives — there is no Agent
   * entity to hold it. A member list that only resolved humans printed a raw
   * uuid where an operator expected "Builder", which makes assigning work to
   * an agent a guessing game.
   */
  it("names an agent in the member list it joins", async () => {
    const workspace = await authed("post", "/workspaces")
      .send({ organizationId, name: "Naming" })
      .expect(201);

    const agent = await authed("post", `/organizations/${organizationId}/actors`)
      .send({ actorType: "AGENT", displayName: "Builder" })
      .expect(201);

    await authed("post", `/workspaces/${workspace.body.workspaceId}/members`)
      .send({ role: "AGENT_CONTRIBUTOR", actorType: "AGENT", actorId: agent.body.actorId })
      .expect(201);

    const members = await authed(
      "get",
      `/workspaces/${workspace.body.workspaceId}/members`,
    ).expect(200);

    expect(members.body).toContainEqual(
      expect.objectContaining({
        actorType: "AGENT",
        actorId: agent.body.actorId,
        displayName: "Builder",
      }),
    );
  });

  it("refuses to mint a human — people register, they are not issued", async () => {
    await authed("post", `/organizations/${organizationId}/actors`)
      .send({ actorType: "HUMAN", displayName: "Not a person" })
      .expect(400);
  });

  /**
   * §18 — naming somebody else's organization would be a cross-organization
   * impersonation route, so ownership is checked rather than assumed.
   */
  it("refuses somebody who does not own the organization", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...owner, email: "stranger@example.com" })
      .expect(201);
    const stranger = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "stranger@example.com", password: owner.password })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/actors`)
      .set("Authorization", `Bearer ${stranger.body.accessToken}`)
      .send({ actorType: "AGENT", displayName: "Trespasser" })
      .expect(403);
  });
});
