import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Event (e2e)", () => {
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
      .send({ name: "Event workspace" })
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

  it("records an event attributed to the authenticated requester", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("event-owner@example.com");

    const recorded = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "agent.intention", payload: { summary: "about to start the dev server" } })
      .expect(201);

    expect(recorded.body.type).toBe("agent.intention");
    expect(recorded.body.severity).toBe("INFO");
    expect(recorded.body.actor.type).toBe("HUMAN");
    expect(recorded.body.payload).toEqual({ summary: "about to start the dev server" });
  });

  it("rejects an empty type (400)", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("event-invalid@example.com");

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "" })
      .expect(400);
  });

  it("gets an event by id and lists events scoped to the workspace", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("event-list@example.com");
    const recorded = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "agent.blocker" })
      .expect(201);
    const eventId = recorded.body.id as string;

    const fetched = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.type).toBe("agent.blocker");

    const all = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(all.body).toHaveLength(1);
  });

  it("returns 404 for an unknown event id", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("event-404@example.com");

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/events/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("reproduces the broadcast/partial-ack scenario: 2 recipients, only one acknowledges, the unread query distinguishes them", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("event-broadcast-owner@example.com");
    const agent1Token = await registerAgentToken(token, workspaceId, "Agent One");
    const agent2Token = await registerAgentToken(token, workspaceId, "Agent Two");

    const recorded = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "agent.validation_request" })
      .expect(201);
    const eventId = recorded.body.id as string;

    const acked = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/events/${eventId}/receipts`)
      .set("Authorization", `Bearer ${agent1Token}`)
      .send({ status: "ACKNOWLEDGED" })
      .expect(201);
    expect(acked.body.status).toBe("ACKNOWLEDGED");
    expect(acked.body.actorType).toBe("AGENT");

    const seenOnly = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/events/${eventId}/receipts`)
      .set("Authorization", `Bearer ${agent2Token}`)
      .send({ status: "SEEN" })
      .expect(201);
    expect(seenOnly.body.status).toBe("SEEN");

    const receipts = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/events/${eventId}/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(receipts.body).toHaveLength(2);
    const byActorId = Object.fromEntries(
      (receipts.body as Array<{ actorId: string; status: string }>).map((r) => [r.actorId, r.status]),
    );
    expect(byActorId[acked.body.actorId]).toBe("ACKNOWLEDGED");
    expect(byActorId[seenOnly.body.actorId]).toBe("SEEN");
  });
});
