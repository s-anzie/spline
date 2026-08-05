import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §6.3, §18.2 — how a machine comes to be trusted.
 *
 * Until now nothing did: `IssueActorCredentialUseCase` was written, tested
 * and reachable from no route at all, so an operator could not obtain a
 * worker token without writing code. The other e2e suites hid the gap by
 * calling the use case directly — which is the shape of a hole a test suite
 * can make invisible.
 *
 * The flow is pairing, not minting. Studying how OpenClaw enrols nodes made
 * the difference clear: minting a token in the hub and pasting it into the
 * machine moves a long-lived secret through a clipboard and a shell history,
 * once per machine. Here the machine generates its own identity, prints a
 * short-lived code on its own console, and an operator approves that code.
 */
describe("Worker enrolment (e2e)", () => {
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

  async function owner(email: string) {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email, password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email, password: "a-strong-password" })
      .expect(200);
    const token = logged.body.accessToken as string;
    return {
      organizationId: registered.body.organizationId as string,
      userId: registered.body.userId as string,
      auth: (r: request.Test) => r.set("Authorization", `Bearer ${token}`),
    };
  }

  /** What the daemon does at startup when it holds no token. */
  async function knock(deviceId = "device-abc", capabilities = ["docker"]) {
    const asked = await request(http)
      .post("/runtime/enrolments")
      .send({
        deviceId,
        hostname: "workshop-01",
        architecture: "x86_64",
        operatingSystem: "linux",
        capabilities,
      })
      .expect(201);
    return asked.body as { enrolmentId: string; code: string; expiresAt: string };
  }

  it("pairs a machine: it asks, an owner approves, it collects its token", async () => {
    const o = await owner("owner@example.com");
    const asked = await knock();

    // The code is what the machine printed on its own console.
    expect(asked.code).toHaveLength(8);

    const pending = await o
      .auth(request(http).get(`/organizations/${o.organizationId}/enrolments`))
      .expect(200);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0].hostname).toBe("workshop-01");
    expect(pending.body[0].expired).toBe(false);
    // The list never shows the code: reading it off the machine is the whole
    // out-of-band factor, and a list that leaked it would remove that.
    expect(pending.body[0]).not.toHaveProperty("code");

    await o
      .auth(request(http).post(`/organizations/${o.organizationId}/enrolments/decide`))
      .send({ code: asked.code })
      .expect(200);

    const claimed = await request(http)
      .post(`/runtime/enrolments/${asked.enrolmentId}/claim`)
      .send({ deviceId: "device-abc" })
      .expect(200);

    expect(claimed.body.token).toMatch(/^worker_[^.]+\..+/);
    expect(claimed.body.organizationId).toBe(o.organizationId);
  });

  /** The point of the whole flow: a token that actually works. */
  it("hands over a token the machine can immediately register with", async () => {
    const o = await owner("owner@example.com");
    const asked = await knock();
    await o
      .auth(request(http).post(`/organizations/${o.organizationId}/enrolments/decide`))
      .send({ code: asked.code })
      .expect(200);
    const claimed = await request(http)
      .post(`/runtime/enrolments/${asked.enrolmentId}/claim`)
      .send({ deviceId: "device-abc" })
      .expect(200);

    await request(http)
      .post("/runtime/workers")
      .set("Authorization", `Bearer ${claimed.body.token}`)
      .send({ hostname: "workshop-01", architecture: "x86_64", operatingSystem: "linux" })
      .expect(201);
  });

  describe("nothing is granted by asking", () => {
    /**
     * A worker polls this while it waits. 409 rather than 403 so "not yet"
     * reads as a state to retry, not as a refusal to give up on.
     */
    it("refuses to hand a token to an unapproved request", async () => {
      const asked = await knock();

      await request(http)
        .post(`/runtime/enrolments/${asked.enrolmentId}/claim`)
        .send({ deviceId: "device-abc" })
        .expect(409);
    });

    it("refuses a claim from a machine that did not make the request", async () => {
      const o = await owner("owner@example.com");
      const asked = await knock();
      await o
        .auth(request(http).post(`/organizations/${o.organizationId}/enrolments/decide`))
        .send({ code: asked.code })
        .expect(200);

      // Knowing the enrolment id is not enough: you have to be the machine.
      await request(http)
        .post(`/runtime/enrolments/${asked.enrolmentId}/claim`)
        .send({ deviceId: "some-other-device" })
        .expect(409);
    });

    it("hands a token over exactly once", async () => {
      const o = await owner("owner@example.com");
      const asked = await knock();
      await o
        .auth(request(http).post(`/organizations/${o.organizationId}/enrolments/decide`))
        .send({ code: asked.code })
        .expect(200);
      await request(http)
        .post(`/runtime/enrolments/${asked.enrolmentId}/claim`)
        .send({ deviceId: "device-abc" })
        .expect(200);

      await request(http)
        .post(`/runtime/enrolments/${asked.enrolmentId}/claim`)
        .send({ deviceId: "device-abc" })
        .expect(409);
    });

    it("can be rejected, and a rejected request never becomes a token", async () => {
      const o = await owner("owner@example.com");
      const asked = await knock();

      await o
        .auth(request(http).post(`/organizations/${o.organizationId}/enrolments/decide`))
        .send({ code: asked.code, approve: false })
        .expect(200);

      await request(http)
        .post(`/runtime/enrolments/${asked.enrolmentId}/claim`)
        .send({ deviceId: "device-abc" })
        .expect(409);
    });
  });

  describe("who may approve", () => {
    it("refuses anyone who is not the organization's owner", async () => {
      const mine = await owner("mine@example.com");
      const theirs = await owner("theirs@example.com");
      const asked = await knock();

      await theirs
        .auth(request(http).post(`/organizations/${mine.organizationId}/enrolments/decide`))
        .send({ code: asked.code })
        .expect(403);

      await theirs
        .auth(request(http).get(`/organizations/${mine.organizationId}/enrolments`))
        .expect(403);
    });

    it("refuses an unauthenticated decision outright", async () => {
      const o = await owner("owner@example.com");
      const asked = await knock();

      await request(http)
        .post(`/organizations/${o.organizationId}/enrolments/decide`)
        .send({ code: asked.code })
        .expect(401);
    });

    /** A code that names no request tells the caller nothing else. */
    it("answers 404 for a code that does not exist", async () => {
      const o = await owner("owner@example.com");

      await o
        .auth(request(http).post(`/organizations/${o.organizationId}/enrolments/decide`))
        .send({ code: "ZZZZZZZZ" })
        .expect(404);
    });
  });
});
