import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §14 and §4.2 — the activity that belongs to no workspace.
 *
 * Pairing a machine, issuing an identity, renaming the organization: these are
 * facts of the ORGANISATION, recorded with no `workspaceId` at all, and until
 * now nothing could read them. A thousand of them sat in the journal unseen.
 *
 * What this route is NOT is a roll-up of the workspaces underneath. §4.2 has
 * no exception, and a list that mixed two workspaces would be the first read
 * that broke it — every screen after would cite this one as precedent.
 */
describe("Organization activity (e2e)", () => {
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

  async function owner(email: string) {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email, password, displayName: email })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email, password })
      .expect(200);
    return {
      organizationId: registered.body.organizationId as string,
      token: logged.body.accessToken as string,
    };
  }

  const authed = (token: string, method: "get" | "post" | "patch", path: string) =>
    request(http)[method](path).set("Authorization", `Bearer ${token}`);

  it("shows what the organization did, and never a workspace's own facts", async () => {
    const me = await owner("mine@example.com");

    // Three organization-level acts…
    await authed(me.token, "patch", `/organizations/${me.organizationId}`)
      .send({ name: "Lovelace Engineering" })
      .expect(200);
    await authed(me.token, "post", `/organizations/${me.organizationId}/actors`)
      .send({ actorType: "AGENT", displayName: "Scout" })
      .expect(201);

    // …and one that happens INSIDE a workspace.
    const workspace = await authed(me.token, "post", "/workspaces")
      .send({ organizationId: me.organizationId, name: "Payments" })
      .expect(201);
    await authed(me.token, "post", `/workspaces/${workspace.body.workspaceId}/goals`)
      .send({ title: "Ship it", successCriteria: ["it shipped"] })
      .expect(201);

    const activity = await authed(
      me.token,
      "get",
      `/organizations/${me.organizationId}/events`,
    ).expect(200);

    const types = activity.body.map((event: { type: string }) => event.type);
    expect(types).toContain("identity.organization_renamed");
    expect(types).toContain("identity.credential_issued");
    // §4.2 — what happened in a workspace is read in that workspace.
    expect(types.some((type: string) => type.startsWith("goal."))).toBe(false);
    for (const event of activity.body) {
      expect(event.workspaceId).toBeNull();
    }
  });

  it("never shows another organization's facts", async () => {
    const mine = await owner("mine@example.com");
    const theirs = await owner("theirs@example.com");

    await authed(mine.token, "post", `/organizations/${mine.organizationId}/actors`)
      .send({ actorType: "AGENT", displayName: "Mine" })
      .expect(201);
    await authed(theirs.token, "post", `/organizations/${theirs.organizationId}/actors`)
      .send({ actorType: "AGENT", displayName: "Theirs" })
      .expect(201);

    const seen = await authed(
      theirs.token,
      "get",
      `/organizations/${theirs.organizationId}/events`,
    ).expect(200);

    // Their own credential shows; mine does not.
    expect(seen.body.length).toBeGreaterThan(0);
    const mineRenamed = await authed(
      mine.token,
      "get",
      `/organizations/${mine.organizationId}/events`,
    ).expect(200);

    const theirIds = new Set(seen.body.map((event: { id: string }) => event.id));
    const overlap = mineRenamed.body.filter((event: { id: string }) => theirIds.has(event.id));
    expect(overlap).toEqual([]);
  });

  it("refuses somebody who does not own the organization", async () => {
    const mine = await owner("mine@example.com");
    const stranger = await owner("stranger@example.com");

    await authed(stranger.token, "get", `/organizations/${mine.organizationId}/events`).expect(
      403,
    );
  });
});
