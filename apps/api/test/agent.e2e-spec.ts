import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Agent (e2e)", () => {
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
      .send({ name: "Agent workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  it("supports the full agent lifecycle: register, update, report health, force offline", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("agent-owner@example.com");

    const registered = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "claude", displayName: "Claude worker #1", capabilities: ["code_edit"] })
      .expect(201);
    expect(registered.body.status).toBe("OFFLINE");
    expect(typeof registered.body.token).toBe("string");
    expect(registered.body.token.startsWith("agent_")).toBe(true);
    const agentId = registered.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/agents/${agentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Renamed worker" })
      .expect(200);
    expect(updated.body.displayName).toBe("Renamed worker");

    const withHealth = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents/${agentId}/health`)
      .set("Authorization", `Bearer ${token}`)
      .send({ healthState: "HEALTHY" })
      .expect(201);
    expect(withHealth.body.healthState).toBe("HEALTHY");

    const offline = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents/${agentId}/offline`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(offline.body.status).toBe("OFFLINE");

    const fetched = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/agents/${agentId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.displayName).toBe("Renamed worker");
  });

  it("lists agents scoped to the workspace", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("agent-list@example.com");
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "claude", displayName: "A" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "codex", displayName: "B" })
      .expect(201);

    const all = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(all.body).toHaveLength(2);
  });

  it("authenticates an agent with its issued token and lets it authenticate against a protected route", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("agent-auth@example.com");
    const registered = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "claude", displayName: "Claude worker" })
      .expect(201);
    const agentToken = registered.body.token as string;

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200);
  });

  it("exposes the seeded provider profile catalog", async () => {
    const { token } = await registerLoginAndCreateWorkspace("agent-providers@example.com");

    const profiles = await request(app.getHttpServer())
      .get("/provider-profiles")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(profiles.body.map((p: { provider: string }) => p.provider).sort()).toEqual(["claude", "codex"]);
  });
});
