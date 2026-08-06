import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §6.3 vs §6.10 — pairing and serving are two different acts.
 *
 * Approving an enrolment binds a machine to an ORGANIZATION. Serving a
 * workspace is a second, deliberate decision. Without a way to list the
 * machines an organization already has, a second workspace can never get one:
 * its own list is empty by definition, and the only thing left to try is
 * pairing again — which the hub correctly refuses, because that machine is
 * already paired.
 */
describe("Machine attachment (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let token: string;
  let organizationId: string;

  const owner = {
    email: "fleet@example.com",
    password: "a-strong-password",
    displayName: "Fleet owner",
  };

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
    const registered = await request(http).post("/auth/register").send(owner).expect(201);
    organizationId = registered.body.organizationId;
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    token = logged.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: "post" | "get", path: string) =>
    request(http)[method](path).set("Authorization", `Bearer ${token}`);

  /** Pairs a machine and lets it register itself, as a real worker does. */
  async function pairMachine(hostname: string): Promise<string> {
    const deviceId = `device-${hostname}`;
    const asked = await request(http)
      .post("/runtime/enrolments")
      .send({
        deviceId,
        organizationId,
        hostname,
        architecture: "x64",
        operatingSystem: "linux",
        capabilities: ["claude"],
      })
      .expect(201);

    await authed("post", `/organizations/${organizationId}/enrolments/decide`)
      .send({ code: asked.body.code, approve: true })
      .expect(200);

    const claimed = await request(http)
      .post(`/runtime/enrolments/${asked.body.enrolmentId}/claim`)
      .send({ deviceId })
      .expect(200);

    const node = await request(http)
      .post("/runtime/workers")
      .set("Authorization", `Bearer ${claimed.body.token}`)
      .send({
        hostname,
        architecture: "x64",
        operatingSystem: "linux",
        capabilities: ["claude"],
      })
      .expect(201);

    return node.body.workerId as string;
  }

  async function makeWorkspace(name: string): Promise<string> {
    const created = await authed("post", "/workspaces")
      .send({ organizationId, name })
      .expect(201);
    return created.body.workspaceId as string;
  }

  it("lists an organization's machines, and says which workspaces each serves", async () => {
    const workerId = await pairMachine("workshop-01");
    const first = await makeWorkspace("First");
    await authed("post", `/workspaces/${first}/runtime/workers`)
      .send({ workerId })
      .expect(200);

    const fleet = await authed("get", `/organizations/${organizationId}/workers`).expect(200);

    expect(fleet.body).toHaveLength(1);
    expect(fleet.body[0]).toMatchObject({
      id: workerId,
      hostname: "workshop-01",
      capabilities: ["claude"],
      serves: [first],
    });
  });

  /**
   * The whole point: a NEW workspace starts with no machine, and the operator
   * must be able to find the one they already own.
   */
  it("lets a second workspace be served by a machine that is already paired", async () => {
    await pairMachine("workshop-01");
    const second = await makeWorkspace("Second");

    // Its own list is empty — that is §6.10, not a bug.
    const before = await authed("get", `/workspaces/${second}/runtime/workers`).expect(200);
    expect(before.body).toHaveLength(0);

    // But the organization's list shows it, serving nothing yet.
    const fleet = await authed("get", `/organizations/${organizationId}/workers`).expect(200);
    expect(fleet.body[0].serves).toEqual([]);

    await authed("post", `/workspaces/${second}/runtime/workers`)
      .send({ workerId: fleet.body[0].id })
      .expect(200);

    const after = await authed("get", `/workspaces/${second}/runtime/workers`).expect(200);
    expect(after.body).toHaveLength(1);
    expect(after.body[0].hostname).toBe("workshop-01");
  });

  /** §18 — somebody else's fleet is not a list you may read. */
  it("refuses somebody who does not own the organization", async () => {
    await request(http)
      .post("/auth/register")
      .send({ ...owner, email: "stranger@example.com" })
      .expect(201);
    const stranger = await request(http)
      .post("/auth/login")
      .send({ email: "stranger@example.com", password: owner.password })
      .expect(200);

    await request(http)
      .get(`/organizations/${organizationId}/workers`)
      .set("Authorization", `Bearer ${stranger.body.accessToken}`)
      .expect(403);
  });

  /** A machine paired into another organization is not in this fleet. */
  it("never shows a machine belonging to another organization", async () => {
    await pairMachine("workshop-01");

    await request(http)
      .post("/auth/register")
      .send({ ...owner, email: "other@example.com" })
      .expect(201);
    const other = await request(http)
      .post("/auth/login")
      .send({ email: "other@example.com", password: owner.password })
      .expect(200);
    const otherOrg = (
      await request(http)
        .get("/organizations")
        .set("Authorization", `Bearer ${other.body.accessToken}`)
        .expect(200)
    ).body[0].id;

    const theirs = await request(http)
      .get(`/organizations/${otherOrg}/workers`)
      .set("Authorization", `Bearer ${other.body.accessToken}`)
      .expect(200);
    expect(theirs.body).toHaveLength(0);
  });
});
