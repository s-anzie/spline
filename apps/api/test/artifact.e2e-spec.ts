import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Artifact (e2e)", () => {
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
      .send({ name: "Artifact workspace" })
      .expect(201);
    return { token, workspaceId: workspace.body.id as string };
  }

  it("supports the full artifact lifecycle: create, version, link, unlink, archive", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("artifact-owner@example.com");
    const goal = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ship the MVP" })
      .expect(201);
    const task = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Write the login endpoint" })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goalId: goal.body.id, type: "DIFF", name: "login.diff" })
      .expect(201);
    const artifactId = created.body.id as string;
    expect(created.body.version).toBe(1);
    expect(created.body.goalId).toBe(goal.body.id);

    const versioned = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts/${artifactId}/versions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ contentRef: "s3://bucket/v2.diff" })
      .expect(201);
    expect(versioned.body.version).toBe(2);
    expect(versioned.body.versions).toHaveLength(2);

    const linked = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts/${artifactId}/link`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetType: "task", targetId: task.body.id })
      .expect(201);
    expect(linked.body.taskId).toBe(task.body.id);

    const unlinked = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts/${artifactId}/unlink`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetType: "goal" })
      .expect(201);
    expect(unlinked.body.goalId).toBeNull();
    expect(unlinked.body.taskId).toBe(task.body.id);

    const updated = await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "login-final.diff" })
      .expect(200);
    expect(updated.body.name).toBe("login-final.diff");

    const archived = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts/${artifactId}/archive`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(archived.body.status).toBe("ARCHIVED");

    await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "should fail" })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("rejects linking an artifact to a goal from a different workspace (404)", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("artifact-cross@example.com");
    const other = await registerLoginAndCreateWorkspace("artifact-cross-other@example.com");
    const otherGoal = await request(app.getHttpServer())
      .post(`/workspaces/${other.workspaceId}/goals`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ title: "Other workspace goal" })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "NOTE", name: "note.md" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts/${created.body.id}/link`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetType: "goal", targetId: otherGoal.body.id })
      .expect(404);
  });

  it("lists artifacts scoped to the workspace and filters by goal", async () => {
    const { token, workspaceId } = await registerLoginAndCreateWorkspace("artifact-list@example.com");
    const goal = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/goals`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Goal" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goalId: goal.body.id, type: "NOTE", name: "With goal" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/artifacts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "NOTE", name: "No goal" })
      .expect(201);

    const all = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/artifacts`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const scoped = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/artifacts?goalId=${goal.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(all.body).toHaveLength(2);
    expect(scoped.body).toHaveLength(1);
    expect(scoped.body[0].name).toBe("With goal");
  });
});
