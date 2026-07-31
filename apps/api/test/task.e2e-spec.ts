import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Task (e2e)", () => {
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
      .send({ name: "Task workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  it("supports the full task lifecycle: create, assign, progress, validate", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("task-owner@example.com");

    const goal = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ship the MVP" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals/${goal.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "ACTIVE" })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goalId: goal.body.id, title: "Write the login endpoint" })
      .expect(201);
    const taskId = created.body.id as string;
    expect(created.body.status).toBe("BACKLOG");

    const assigned = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${taskId}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assigneeType: "HUMAN", assigneeId: "someone" })
      .expect(201);
    expect(assigned.body.assigneeId).toBe("someone");

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${taskId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "TODO" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${taskId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${taskId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_REVIEW" })
      .expect(201);

    const validated = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${taskId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(validated.body.status).toBe("DONE");

    const reloadedGoal = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/goals/${goal.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(reloadedGoal.body.progressPercentage).toBe(100);
    expect(reloadedGoal.body.status).toBe("REVIEW");
  });

  it("reports a blocker on a task, moving it to BLOCKED, and clears it on unblock", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("task-blocker@example.com");
    const created = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Do it" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${created.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "TODO" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${created.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS" })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${created.body.id}/blockers`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Waiting on design" })
      .expect(201);
    expect(blocked.body.status).toBe("BLOCKED");
    expect(blocked.body.blockers).toHaveLength(1);
    expect(blocked.body.blockers[0].resolvedAt).toBeUndefined();

    const unblocked = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${created.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS" })
      .expect(201);
    expect(unblocked.body.blockers[0].resolvedAt).not.toBeNull();
  });

  it("blocks starting a task whose dependency is not done yet (409)", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("task-deps@example.com");
    const dependency = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Dependency" })
      .expect(201);
    const task = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Depends on the other one", dependencies: [dependency.body.id] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${task.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "TODO" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${task.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS" })
      .expect(409);
  });

  it("lists tasks scoped to the workspace and filters by goal", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("task-list@example.com");
    const goal = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Goal" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goalId: goal.body.id, title: "With goal" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "No goal" })
      .expect(201);

    const all = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const scoped = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/tasks?goalId=${goal.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(all.body).toHaveLength(2);
    expect(scoped.body).toHaveLength(1);
    expect(scoped.body[0].title).toBe("With goal");
  });
});
