import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

const credentials = {
  email: "bradley@example.com",
  password: "a-strong-password",
  displayName: "Bradley",
};

describe("Auth (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase(app.get(PrismaService));
  });

  afterAll(async () => {
    await app.close();
  });

  it("register → login → /auth/me round-trip", async () => {
    const registered = await request(app.getHttpServer())
      .post("/auth/register")
      .send(credentials)
      .expect(201);
    expect(registered.body.userId).toBeTruthy();
    expect(registered.body.organizationId).toBeTruthy();

    const logged = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "BRADLEY@example.com", password: credentials.password })
      .expect(200);
    expect(logged.body.accessToken).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${logged.body.accessToken}`)
      .expect(200);
    expect(me.body).toEqual({
      actorType: "HUMAN",
      actorId: registered.body.userId,
      displayName: "Bradley",
      email: "bradley@example.com",
    });
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app.getHttpServer()).post("/auth/register").send(credentials).expect(201);

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...credentials, email: "BRADLEY@EXAMPLE.COM" })
      .expect(409);
  });

  it("rejects a weak password with 400", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...credentials, password: "short" })
      .expect(400);
  });

  it("rejects bad logins and missing/invalid tokens with 401", async () => {
    await request(app.getHttpServer()).post("/auth/register").send(credentials).expect(201);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: credentials.email, password: "wrong-password!" })
      .expect(401);

    await request(app.getHttpServer()).get("/auth/me").expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-token")
      .expect(401);
  });

  /**
   * §4.1 — an organization can be founded, not only inherited.
   *
   * Registration gave every account exactly one, and there was no route to
   * make another: `POST /organizations` did not exist. So somebody with a
   * second concern, or a second set of machines, had one place to put
   * everything and no way to separate them — and since machines are paired to
   * an ORGANIZATION and lent to its workspaces, that ceiling was on the
   * fleet, not only on tidiness.
   */
  it("founds a second organization, owned by whoever asked", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(credentials)
      .expect(201);
    const logged = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const token = (logged.body as { accessToken: string }).accessToken;

    const created = await request(app.getHttpServer())
      .post("/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Research" })
      .expect(201);
    expect((created.body as { organizationId: string }).organizationId).toBeTruthy();

    const mine = await request(app.getHttpServer())
      .get("/organizations")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const named = (mine.body as { name: string }[]).map((entry) => entry.name).sort();
    expect(named).toContain("Research");
    // The one registration made is still there: founding adds, never replaces.
    expect(named.length).toBe(2);
  });

  /** A name that cannot become a slug is a name this refuses, with a reason. */
  it("refuses a name it cannot make an address from", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(credentials)
      .expect(201);
    const logged = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    await request(app.getHttpServer())
      .post("/organizations")
      .set("Authorization", `Bearer ${(logged.body as { accessToken: string }).accessToken}`)
      .send({ name: "!!!" })
      .expect(400);
  });

});
