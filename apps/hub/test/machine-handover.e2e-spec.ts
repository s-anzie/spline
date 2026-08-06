import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §18 — giving a machine to somebody else, and the wall that made it
 * impossible.
 *
 * Registration keys on the hostname, and a machine record may only be used by
 * the actor that registered it. That rule is right: without it, announcing a
 * hostname somebody else already used would hand back their machine's id — a
 * takeover in one call.
 *
 * What it had no answer for is the legitimate case. A computer re-paired to a
 * new organization arrives with a NEW identity, finds its own hostname owned
 * by its old one, and is refused forever. Observed on a real machine: the
 * daemon retried every five seconds against a 403 it could never satisfy.
 *
 * The release is revocation. An actor whose credentials are all revoked
 * operates nothing — that is what revoking them meant — so the record is free
 * for whoever the machine now belongs to. Nothing else changes: an actor
 * still holding a live credential still cannot be displaced.
 */
describe("Machine handover (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  const password = "a-strong-password";
  const HOSTNAME = "the-same-laptop";

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

  /** The whole pairing dance, as a real worker performs it. */
  async function pair(organizationId: string, ownerToken: string, deviceId: string) {
    const asked = await request(http)
      .post("/runtime/enrolments")
      .send({
        deviceId,
        organizationId,
        hostname: HOSTNAME,
        architecture: "x64",
        operatingSystem: "linux",
        capabilities: ["claude"],
      })
      .expect(201);

    await request(http)
      .post(`/organizations/${organizationId}/enrolments/decide`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ code: asked.body.code })
      .expect(200);

    const claimed = await request(http)
      .post(`/runtime/enrolments/${asked.body.enrolmentId}/claim`)
      .send({ deviceId })
      .expect(200);

    return { token: claimed.body.token as string, credentialId: asked.body.enrolmentId };
  }

  const register = (token: string) =>
    request(http)
      .post("/runtime/workers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        hostname: HOSTNAME,
        architecture: "x64",
        operatingSystem: "linux",
        capabilities: ["claude"],
      });

  it("lets a machine register with the organization it now belongs to, once the old identity is revoked", async () => {
    const first = await owner("first@example.com");
    const second = await owner("second@example.com");

    const before = await pair(first.organizationId, first.token, "device-1");
    await register(before.token).expect(201);

    // The first owner gives the machine up.
    const credentials = await request(http)
      .get(`/organizations/${first.organizationId}/actors`)
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);
    const worker = credentials.body.find(
      (entry: { actorType: string }) => entry.actorType === "WORKER",
    );
    await request(http)
      .post(`/organizations/${first.organizationId}/actors/${worker.credentialId}/revoke`)
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);

    // Same computer, new organization, new identity.
    const after = await pair(second.organizationId, second.token, "device-1");
    await register(after.token).expect(201);

    // And it is the SECOND organization's machine now.
    const fleet = await request(http)
      .get(`/organizations/${second.organizationId}/workers`)
      .set("Authorization", `Bearer ${second.token}`)
      .expect(200);
    expect(fleet.body.map((machine: { hostname: string }) => machine.hostname)).toContain(
      HOSTNAME,
    );

    // The first organization no longer lists it: the credential that tied it
    // there is gone.
    const gone = await request(http)
      .get(`/organizations/${first.organizationId}/workers`)
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);
    expect(gone.body).toEqual([]);
  });

  it("still refuses a takeover while the other identity is live", async () => {
    const first = await owner("first@example.com");
    const second = await owner("second@example.com");

    const before = await pair(first.organizationId, first.token, "device-1");
    await register(before.token).expect(201);

    // Nothing was revoked. This is the impersonation the rule exists for.
    const after = await pair(second.organizationId, second.token, "device-2");
    const refused = await register(after.token).expect(403);
    expect(refused.body.message).toMatch(/another actor/i);
  });

  /**
   * The hole the suite found in the first version of this rule.
   *
   * A person holds no credential — humans sign in with a password, and the
   * credential registry is for agents, workers and services. So "has no live
   * credential" answered TRUE for every operator, and a machine somebody
   * registered by hand became free for anyone to claim. It is the opposite of
   * what this change was for.
   */
  it("never treats a machine an operator registered as free to take", async () => {
    const owner1 = await owner("operator@example.com");
    const other = await owner("stranger@example.com");

    // Registered by the person, with their own token — no worker credential
    // anywhere in the story.
    await request(http)
      .post("/runtime/workers")
      .set("Authorization", `Bearer ${owner1.token}`)
      .send({
        hostname: HOSTNAME,
        architecture: "x64",
        operatingSystem: "linux",
        capabilities: ["claude"],
      })
      .expect(201);

    const theirs = await pair(other.organizationId, other.token, "device-9");
    await register(theirs.token).expect(403);
  });

  it("still lets the same identity restart as often as it likes", async () => {
    const only = await owner("only@example.com");
    const paired = await pair(only.organizationId, only.token, "device-1");

    await register(paired.token).expect(201);
    await register(paired.token).expect(201);
    await register(paired.token).expect(201);
  });
});
