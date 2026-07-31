import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Decision (e2e)", () => {
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
      .send({ name: "Decision workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  it("records a decision attributed to the authenticated requester", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("decision-owner@example.com");

    const recorded = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/decisions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        subject: "Which HTTP client to use",
        context: "Needed HTTP/2 support",
        optionsConsidered: ["axios", "undici"],
        decision: "Use undici",
        confidence: 0.8,
        references: ["artifact-1"],
      })
      .expect(201);

    expect(recorded.body.subject).toBe("Which HTTP client to use");
    expect(recorded.body.decidedByType).toBe("HUMAN");
    expect(recorded.body.optionsConsidered).toEqual(["axios", "undici"]);
    expect(recorded.body.confidence).toBe(0.8);
  });

  it("rejects an empty subject (400)", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("decision-invalid@example.com");

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/decisions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "", decision: "Use undici" })
      .expect(400);
  });

  it("gets a decision by id and lists decisions scoped to the workspace", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("decision-list@example.com");
    const recorded = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/decisions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Subject", decision: "Outcome" })
      .expect(201);
    const decisionId = recorded.body.id as string;

    const fetched = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/decisions/${decisionId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.subject).toBe("Subject");

    const all = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/decisions`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(all.body).toHaveLength(1);
  });

  it("returns 404 for an unknown decision id", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("decision-404@example.com");

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/decisions/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
