import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * A person's own name, changeable by them.
 *
 * It was not: registering set a display name and nothing could ever change
 * it. That name is what every member list, every thread and every task's
 * assignee shows, so a typo at sign-up followed somebody around forever.
 *
 * The email is deliberately NOT changeable here. It is the identity somebody
 * signs in with, and moving it is a different act with different proof —
 * confirming the new address before it starts working, at the least.
 */
describe("Account settings (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let token: string;

  const me = {
    email: "ada@example.com",
    password: "a-strong-password",
    displayName: "Ada",
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
    await request(http).post("/auth/register").send(me).expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: me.email, password: me.password })
      .expect(200);
    token = logged.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("lets somebody correct their own name", async () => {
    await request(http)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Ada Lovelace" })
      .expect(200);

    const after = await request(http)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body.displayName).toBe("Ada Lovelace");
    // The email is the identity: changing a name never touches it.
    expect(after.body.email).toBe("ada@example.com");
  });

  it("refuses a name that is not one", async () => {
    await request(http)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "   " })
      .expect(400);
  });

  /** A machine has no profile to edit: it is named by whoever issued it. */
  it("refuses an actor that is not a person", async () => {
    const organizationId = (
      await request(http)
        .get("/organizations")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body[0].id;

    const agent = await request(http)
      .post(`/organizations/${organizationId}/actors`)
      .set("Authorization", `Bearer ${token}`)
      .send({ actorType: "AGENT", displayName: "Scout" })
      .expect(201);

    await request(http)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${agent.body.token}`)
      .send({ displayName: "Renamed" })
      .expect(403);
  });
});
