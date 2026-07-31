import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Goal (e2e)", () => {
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
      .send({ name: "Goal workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  it("supports the full goal lifecycle: create, list, get, update, status, validate", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("goal-owner@example.com");

    const created = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ship the MVP", priority: "HIGH" })
      .expect(201);
    expect(created.body).toMatchObject({ title: "Ship the MVP", status: "PLANNED", priority: "HIGH" });
    const goalId = created.body.id as string;

    const list = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/goals/${goalId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/goals/${goalId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ship the real MVP" })
      .expect(200);
    expect(updated.body.title).toBe("Ship the real MVP");

    const activated = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals/${goalId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "ACTIVE" })
      .expect(201);
    expect(activated.body.status).toBe("ACTIVE");

    const inReview = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals/${goalId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "REVIEW" })
      .expect(201);
    expect(inReview.body.status).toBe("REVIEW");
    expect(inReview.body.validationState).toBe("PENDING");

    const validated = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals/${goalId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(validated.body.status).toBe("COMPLETED");
    expect(validated.body.validationState).toBe("VALIDATED");
  });

  it("rejects an invalid status transition with 400", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("goal-bad-transition@example.com");
    const created = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ship the MVP" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals/${created.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "COMPLETED" })
      .expect(400);
  });

  it("reports a blocker on a goal, moving it to BLOCKED", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("goal-blocker@example.com");
    const created = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ship the MVP" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals/${created.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "ACTIVE" })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals/${created.body.id}/blockers`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Waiting on legal sign-off" })
      .expect(201);

    expect(blocked.body.status).toBe("BLOCKED");
    expect(blocked.body.blockers).toHaveLength(1);
  });

  it("sets dependencies on a goal", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("goal-deps@example.com");
    const dependency = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Dependency goal" })
      .expect(201);
    const goal = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Main goal" })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/goals/${goal.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dependencies: [dependency.body.id] })
      .expect(200);

    expect(updated.body.dependencies).toEqual([dependency.body.id]);
  });

  it("denies a non-member from creating a goal in someone else's workspace", async () => {
    const { workspaceId } = await registerLoginAndCreateWorkspace("goal-owner2@example.com");
    const stranger = await registerLoginAndCreateWorkspace("goal-stranger@example.com");

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ title: "Sneaky goal" })
      .expect(403);
  });
});
