import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Workspace (e2e)", () => {
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

  async function registerAndLogin(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password: "correct-horse", displayName: email })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "correct-horse" })
      .expect(200);
    return login.body.token as string;
  }

  it("rejects unauthenticated requests", async () => {
    await request(app.getHttpServer()).post("/workspaces").send({ name: "Nope" }).expect(401);
  });

  it("lets an authenticated user create a workspace and become its Owner", async () => {
    const token = await registerAndLogin("owner@example.com");

    const response = await request(app.getHttpServer())
      .post("/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "My Project", description: "desc" })
      .expect(201);

    expect(response.body).toMatchObject({ name: "My Project", description: "desc", status: "ACTIVE" });
  });

  it("only lists workspaces the requester belongs to", async () => {
    const ownerToken = await registerAndLogin("owner2@example.com");
    const strangerToken = await registerAndLogin("stranger@example.com");
    await request(app.getHttpServer())
      .post("/workspaces")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Owner's workspace" })
      .expect(201);

    const ownerList = await request(app.getHttpServer())
      .get("/workspaces")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const strangerList = await request(app.getHttpServer())
      .get("/workspaces")
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(200);

    expect(ownerList.body).toHaveLength(1);
    expect(strangerList.body).toHaveLength(0);
  });

  it("denies a non-member read access to a workspace (403)", async () => {
    const ownerToken = await registerAndLogin("owner3@example.com");
    const strangerToken = await registerAndLogin("stranger3@example.com");
    const created = await request(app.getHttpServer())
      .post("/workspaces")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Private" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/workspaces/${created.body.id}`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(403);
  });

  it("supports the full owner lifecycle: get, rename, update ruleset, duplicate, archive", async () => {
    const token = await registerAndLogin("lifecycle@example.com");
    const created = await request(app.getHttpServer())
      .post("/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Original" })
      .expect(201);
    const workspaceId = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const renamed = await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed" })
      .expect(200);
    expect(renamed.body.name).toBe("Renamed");

    const ruleset = await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/ruleset`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ruleset: { maxConcurrentAgents: 4 } })
      .expect(200);
    expect(ruleset.body.ruleset).toEqual({ maxConcurrentAgents: 4 });

    const duplicated = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/duplicate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed copy" })
      .expect(201);
    expect(duplicated.body.ruleset).toEqual({ maxConcurrentAgents: 4 });
    expect(duplicated.body.id).not.toBe(workspaceId);

    const archived = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/archive`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(archived.body.status).toBe("ARCHIVED");

    await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Should fail" })
      .expect(409);
  });

  it("returns 403 (not 404) for an unknown workspace id, to avoid leaking existence", async () => {
    const token = await registerAndLogin("notfound@example.com");

    await request(app.getHttpServer())
      .get("/workspaces/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });
});
