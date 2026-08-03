import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("ResourceLock (e2e)", () => {
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

  async function registerLoginAndCreateWorkspace(email: string): Promise<{ token: string; workspaceId: string }> {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password: "correct-horse", displayName: email })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "correct-horse" })
      .expect(200);
    const token = login.body.token as string;
    const workspace = await request(app.getHttpServer())
      .post("/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Lock workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  it("acquires and releases a lock", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("lock-owner@example.com");

    const acquired = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/locks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resourceType: "PROCESS", resourceId: "process-1", reason: "starting dev server" })
      .expect(201);
    expect(acquired.body.isHeld).toBe(true);
    const lockId = acquired.body.id as string;

    const released = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/locks/${lockId}/release`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(released.body.isHeld).toBe(false);
    expect(released.body.releasedAt).not.toBeNull();
  });

  it("rejects a different actor acquiring a lock already held on the same resource (409)", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("lock-conflict@example.com");
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/locks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resourceType: "PROCESS", resourceId: "process-1" })
      .expect(201);

    // A different actor (not the current holder) must be rejected.
    const registeredAgent = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "claude", displayName: "Lock contender" })
      .expect(201);
    const agentToken = registeredAgent.body.token as string;

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/locks`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ resourceType: "PROCESS", resourceId: "process-1" })
      .expect(409);
  });

  it("re-acquiring a lock already held by the same actor is idempotent (not a conflict)", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("lock-idempotent@example.com");
    const first = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/locks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resourceType: "PROCESS", resourceId: "process-1" })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/locks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resourceType: "PROCESS", resourceId: "process-1" })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it("lists locks scoped to the workspace", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("lock-list@example.com");
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/locks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resourceType: "TASK", resourceId: "task-1" })
      .expect(201);

    const all = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/locks`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(all.body).toHaveLength(1);
  });
});
