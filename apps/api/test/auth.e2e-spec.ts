import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers a new user without ever returning the password hash", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "someone@example.com", password: "correct-horse", displayName: "Someone" })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      email: "someone@example.com",
      displayName: "Someone",
    });
    expect(response.body.passwordHash).toBeUndefined();
  });

  it("rejects registering the same email twice with 409", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "dup@example.com", password: "correct-horse", displayName: "A" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "dup@example.com", password: "correct-horse", displayName: "B" })
      .expect(409);
  });

  it("rejects an invalid payload with 400", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "not-an-email", password: "short", displayName: "" })
      .expect(400);
  });

  it("logs in with correct credentials and returns a usable token", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "login@example.com", password: "correct-horse", displayName: "Someone" })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "login@example.com", password: "correct-horse" })
      .expect(200);

    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe("login@example.com");
  });

  it("rejects login with a wrong password with 401", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "wrongpw@example.com", password: "correct-horse", displayName: "Someone" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "wrongpw@example.com", password: "incorrect" })
      .expect(401);
  });
});
