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
});
