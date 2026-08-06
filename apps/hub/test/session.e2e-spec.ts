import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §18 — staying signed in, without leaving a long-lived token where a script
 * can read it.
 *
 * The access token is short-lived and kept in the tab's memory; this is the
 * other half. What the browser keeps is an httpOnly cookie that can do
 * exactly one thing — buy a new access token — and that is rotated every time
 * it is used, so a copy of it stops working the moment the real browser
 * refreshes.
 */
describe("Session persistence (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  const password = "a-strong-password";
  const ORIGIN = "http://localhost:3003";

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

  const cookiesOf = (response: request.Response): string[] => {
    const raw = response.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  };

  const sessionCookie = (response: request.Response): string | null => {
    const found = cookiesOf(response).find((cookie) =>
      cookie.startsWith("spline_session="),
    );
    return found ? (found.split(";")[0] as string) : null;
  };

  async function signIn(email: string) {
    await request(http)
      .post("/auth/register")
      .set("Origin", ORIGIN)
      .send({ email, password, displayName: "Ada" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password })
      .expect(200);
    return logged;
  }

  it("hands the browser a cookie it cannot read, scoped to the one route that needs it", async () => {
    const logged = await signIn("ada@example.com");

    const cookie = cookiesOf(logged).find((raw) => raw.startsWith("spline_session="));
    expect(cookie).toBeDefined();
    // httpOnly is the whole point: a token any script on this origin can read
    // turns one XSS into a full takeover.
    expect(cookie).toMatch(/HttpOnly/i);
    // Sent only where it is used. It has no business travelling on every
    // read of a workspace.
    expect(cookie).toMatch(/Path=\/auth/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // And the access token still comes back in the body, not in a cookie.
    expect(logged.body.accessToken).toBeTruthy();
  });

  it("buys a new access token with it, and never with nothing", async () => {
    const logged = await signIn("ada@example.com");

    const refreshed = await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(logged) as string)
      .expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.userId).toBe(logged.body.userId);

    // The new token works on a real route.
    await request(http)
      .get("/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(200);

    // No cookie at all is a 401, not a 500 and not a token.
    await request(http).post("/auth/refresh").set("Origin", ORIGIN).expect(401);
  });

  it("rotates on every use, so the spent one stops working", async () => {
    const logged = await signIn("ada@example.com");
    const first = sessionCookie(logged) as string;

    const refreshed = await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", first)
      .expect(200);
    const second = sessionCookie(refreshed);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    // The successor works…
    await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", second as string)
      .expect(200);
  });

  it("treats a replayed cookie as theft and kills the whole chain", async () => {
    const logged = await signIn("ada@example.com");
    const stolen = sessionCookie(logged) as string;

    const refreshed = await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", stolen)
      .expect(200);
    const live = sessionCookie(refreshed) as string;

    // The thief presents the copy they took before the rotation.
    await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", stolen)
      .expect(401);

    // And the credential the real browser is holding is dead too — the only
    // safe reading of "two holders" is that one of them is not the owner.
    await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", live)
      .expect(401);
  });

  it("signs out for good, and clears the cookie", async () => {
    const logged = await signIn("ada@example.com");
    const cookie = sessionCookie(logged) as string;

    const out = await request(http)
      .post("/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(200);
    // The browser is told to drop it, whatever it was.
    expect(cookiesOf(out).some((raw) => /spline_session=;|spline_session=$/.test(raw))).toBe(
      true,
    );

    await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(401);

    // Signing out twice is not an error: the browser has already forgotten.
    await request(http)
      .post("/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(200);
  });

  it("refuses to answer a page that is not this console", async () => {
    const logged = await signIn("ada@example.com");
    const cookie = sessionCookie(logged) as string;

    // A cookie route with no origin check is CSRF-able: any page can POST to
    // it, and even though CORS stops the attacker READING the answer, the
    // rotation still happens — which logs the real user out.
    await request(http)
      .post("/auth/refresh")
      .set("Origin", "http://evil.example")
      .set("Cookie", cookie)
      .expect(403);

    // The legitimate origin still works afterwards, so the check refused the
    // request rather than spending the credential.
    await request(http)
      .post("/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(200);
  });

  it("will not let another site sign a visitor in as somebody else", async () => {
    await signIn("ada@example.com");

    // Login CSRF: the attacker's page posts THEIR credentials, and the
    // session cookie that comes back becomes the visitor's session.
    await request(http)
      .post("/auth/login")
      .set("Origin", "http://evil.example")
      .send({ email: "ada@example.com", password })
      .expect(403);
  });

  it("still lets a script sign in, because a password is what proves that", async () => {
    await request(http)
      .post("/auth/register")
      .send({ email: "script@example.com", password, displayName: "Script" })
      .expect(201);

    // No Origin at all: a CLI, a deployment script, a test. Nothing to
    // protect against here — a browser always sends the header on the
    // cross-site POST this rule exists to stop.
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "script@example.com", password })
      .expect(200);
    expect(logged.body.accessToken).toBeTruthy();
  });

  it("never lets the session cookie stand in for an access token", async () => {
    const logged = await signIn("ada@example.com");

    // Holding the cookie is not holding a token: every other route still
    // wants the Authorization header, and the cookie names no permission.
    await request(http)
      .get("/auth/me")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(logged) as string)
      .expect(401);
  });
});
