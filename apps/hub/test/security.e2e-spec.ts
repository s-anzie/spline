import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";

import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §18 — the hardening that lives outside any module.
 *
 * These four protections used to exist only in `main.ts`, which no e2e spec
 * ever runs: `moduleRef.createNestApplication()` builds the module graph and
 * nothing else. They now live in `configureApp`, called by both — which is
 * what makes this file possible at all.
 *
 * The rate limits are read from the environment when the controller classes
 * are defined, so they are set here BEFORE the module graph is required.
 * That is why `AppModule` arrives through `require` in `beforeAll` rather
 * than a static import at the top of the file: static imports hoist above
 * every statement, and would read the suite-wide limits instead.
 */
describe("Security hardening (e2e)", () => {
  let app: INestApplication;
  const previousLimits = {
    auth: process.env.AUTH_THROTTLE_LIMIT,
    global: process.env.THROTTLE_LIMIT,
  };

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = "3";
    process.env.THROTTLE_LIMIT = "1000000";
    process.env.CORS_ORIGINS = "https://console.spline.test";

    // No `jest.resetModules()` here: it would hand the app graph a second
    // copy of @nestjs/core while @nestjs/testing keeps the first, and DI
    // matches providers by class identity. Nothing under src/ is imported
    // statically by this file, so a plain require is already a first load.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } = require("../src/app.module") as typeof import("../src/app.module");
    const { configureApp } = require("../src/bootstrap") as typeof import("../src/bootstrap");
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.AUTH_THROTTLE_LIMIT = previousLimits.auth;
    process.env.THROTTLE_LIMIT = previousLimits.global;
    delete process.env.CORS_ORIGINS;
  });

  beforeEach(async () => {
    await resetDatabase(app.get(PrismaService));
    // The counters live in memory and are keyed per handler, so one test's
    // attempts would otherwise be charged to the next one's budget.
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
  });

  describe("browser origins", () => {
    it("answers a listed origin with permission to read the response", async () => {
      const response = await request(app.getHttpServer())
        .get("/health")
        .set("Origin", "https://console.spline.test")
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBe(
        "https://console.spline.test",
      );
    });

    /**
     * The defect this replaces: `enableCors()` with no argument echoed every
     * origin, so any page a member visited could read this API's answers
     * from their browser.
     */
    it("gives an unlisted origin no permission to read the response", async () => {
      const response = await request(app.getHttpServer())
        .get("/health")
        .set("Origin", "https://evil.example")
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  it("sends the headers a browser needs to be told", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
    // A header that names the framework tells an attacker which advisories
    // to read; helmet removes it.
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("refuses a body larger than the ceiling instead of buffering it", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: "big@example.com",
        password: "correct horse battery",
        displayName: "x".repeat(400_000),
      })
      .expect(413);
  });

  describe("guessing a secret", () => {
    it("stops repeated login attempts once the ceiling is reached", async () => {
      const attempt = (): request.Test =>
        request(app.getHttpServer())
          .post("/auth/login")
          .send({ email: "nobody@example.com", password: "wrong-password-here" });

      // The limit is 3 for this spec: three refusals, then the door closes.
      await attempt().expect(401);
      await attempt().expect(401);
      await attempt().expect(401);
      await attempt().expect(429);
    });

    /**
     * §18 again, from the other side: a wrong password and an unknown
     * address must be indistinguishable, or the login route becomes a way to
     * enumerate who has an account here.
     */
    it("answers the same way for an unknown address and a wrong password", async () => {
      await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "known@example.com",
          password: "correct horse battery",
          displayName: "Known",
        })
        .expect(201);

      const unknown = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "unknown@example.com", password: "correct horse battery" })
        .expect(401);

      const wrongPassword = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "known@example.com", password: "wrong horse battery" })
        .expect(401);

      expect(unknown.body.message).toBe(wrongPassword.body.message);
    });
  });

  it("refuses a password too short to be worth hashing", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "weak@example.com", password: "short", displayName: "Weak" })
      .expect(400);

    expect(String(response.body.message)).toMatch(/12/);
  });
});
