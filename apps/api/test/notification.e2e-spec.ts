import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Notification (e2e)", () => {
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
      .send({ name: "Notification workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  async function registerAgentToken(ownerToken: string, workspaceId: string, displayName: string): Promise<string> {
    const agent = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ provider: "claude", displayName })
      .expect(201);
    return agent.body.token as string;
  }

  it("sends a DIRECT chat_message notification to an explicit recipient", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("notif-direct@example.com");
    const agentToken = await registerAgentToken(token, workspaceId, "Worker");
    const meAgent = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200);
    const agentId = meAgent.body[0].id as string;

    const sent = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/notifications`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        body: "Can you review this?",
        recipients: [{ type: "AGENT", id: agentId }],
      })
      .expect(201);

    expect(sent.body.notification.kind).toBe("CHAT_MESSAGE");
    expect(sent.body.notification.createdBy.type).toBe("HUMAN");
    expect(sent.body.recipients).toHaveLength(1);
    expect(sent.body.recipients[0].recipientId).toBe(agentId);
    expect(sent.body.recipients[0].deliveryStatus).toBe("PENDING");
  });

  it("rejects a DIRECT notification with no recipients (400)", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("notif-invalid@example.com");

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/notifications`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "CHAT_MESSAGE", scope: "DIRECT", body: "Hello", recipients: [] })
      .expect(400);
  });

  it(
    "reproduces the section 11 acceptance scenario: BROADCAST to 3 agents, one reads it, GET /notifications/unread " +
      "(cross-workspace, no workspaceId) no longer returns it for that agent but still does for the other two",
    async () => {
      const { token, workspaceId } = await registerLoginAndCreateWorkspace("notif-broadcast-owner@example.com");
      const agent1Token = await registerAgentToken(token, workspaceId, "Agent One");
      const agent2Token = await registerAgentToken(token, workspaceId, "Agent Two");
      const agent3Token = await registerAgentToken(token, workspaceId, "Agent Three");

      const agentList = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/agents`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const agentIdByToken = new Map<string, string>();
      for (const [agentToken, displayName] of [
        [agent1Token, "Agent One"],
        [agent2Token, "Agent Two"],
        [agent3Token, "Agent Three"],
      ] as const) {
        const match = (agentList.body as Array<{ id: string; displayName: string }>).find(
          (a) => a.displayName === displayName,
        );
        agentIdByToken.set(agentToken, match!.id);
      }

      const sent = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/notifications`)
        .set("Authorization", `Bearer ${token}`)
        .send({ kind: "SYSTEM_ALERT", scope: "BROADCAST", title: "Process crashed", body: "process-1 exited with code 1" })
        .expect(201);
      expect(sent.body.recipients).toHaveLength(3);
      const notificationId = sent.body.notification.id as string;

      // Agent One reads (advances to SEEN) their own copy.
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/notifications/${notificationId}/advance`)
        .set("Authorization", `Bearer ${agent1Token}`)
        .send({ status: "SEEN" })
        .expect(201);

      const agent1Id = agentIdByToken.get(agent1Token)!;
      const agent2Id = agentIdByToken.get(agent2Token)!;
      const agent3Id = agentIdByToken.get(agent3Token)!;

      const unreadAgent1 = await request(app.getHttpServer())
        .get(`/notifications/unread?recipientType=AGENT&recipientId=${agent1Id}`)
        .set("Authorization", `Bearer ${agent1Token}`)
        .expect(200);
      const unreadAgent2 = await request(app.getHttpServer())
        .get(`/notifications/unread?recipientType=AGENT&recipientId=${agent2Id}`)
        .set("Authorization", `Bearer ${agent2Token}`)
        .expect(200);
      const unreadAgent3 = await request(app.getHttpServer())
        .get(`/notifications/unread?recipientType=AGENT&recipientId=${agent3Id}`)
        .set("Authorization", `Bearer ${agent3Token}`)
        .expect(200);

      expect(unreadAgent1.body).toHaveLength(0);
      expect(unreadAgent2.body).toHaveLength(1);
      expect(unreadAgent2.body[0].notification.id).toBe(notificationId);
      expect(unreadAgent3.body).toHaveLength(1);
      expect(unreadAgent3.body[0].notification.id).toBe(notificationId);
    },
  );

  it("gets a notification by id and lists notifications scoped to the workspace", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("notif-list@example.com");
    const agentToken = await registerAgentToken(token, workspaceId, "Worker");
    const meAgent = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/agents`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200);
    const agentId = meAgent.body[0].id as string;

    const sent = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/notifications`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "CHAT_MESSAGE", scope: "DIRECT", body: "Hi", recipients: [{ type: "AGENT", id: agentId }] })
      .expect(201);
    const notificationId = sent.body.notification.id as string;

    const fetched = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/notifications/${notificationId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.body).toBe("Hi");

    const all = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/notifications`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(all.body).toHaveLength(1);
  });
});
