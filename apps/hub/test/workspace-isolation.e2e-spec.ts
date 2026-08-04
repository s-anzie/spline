import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §4.2 — workspace isolation admits no exception. The permission guard proves
 * the caller belongs to the workspace **named in the URL**; it proves nothing
 * about the object the id points at. Every route that takes both must check
 * that they agree, or the URL's workspace is decorative and any member of any
 * workspace reaches every other one by pasting an id.
 *
 * This suite is deliberately exhaustive rather than illustrative: it is the
 * only place where forgetting the check on a new route gets caught. The owner
 * here is an owner of BOTH workspaces, so a refusal can only come from the
 * scoping itself — never from a missing permission.
 */
describe("Workspace isolation (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  let token: string;
  const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

  interface Furnished {
    workspaceId: string;
    goalId: string;
    taskId: string;
    artifactId: string;
    decisionId: string;
    eventId: string;
    membershipId: string;
  }

  /** One workspace holding one of everything the API can address. */
  async function furnish(
    organizationId: string,
    userId: string,
    name: string,
  ): Promise<Furnished> {
    const workspace = await auth(request(http).post("/workspaces"))
      .send({ organizationId, name })
      .expect(201);
    const workspaceId = workspace.body.workspaceId as string;
    const at = (suffix: string) => `/workspaces/${workspaceId}${suffix}`;

    const goal = await auth(request(http).post(at("/goals")))
      .send({ title: `Goal ${name}`, successCriteria: ["done"] })
      .expect(201);
    const task = await auth(request(http).post(at("/tasks")))
      .send({
        goalId: goal.body.goalId,
        title: `Task ${name}`,
        acceptanceCriteria: ["ok"],
        assigneeType: "HUMAN",
        assigneeId: userId,
      })
      .expect(201);
    const decision = await auth(request(http).post(at("/decisions")))
      .send({ subject: `D ${name}`, rationale: "because", outcome: "go" })
      .expect(201);
    const artifact = await auth(request(http).post(at("/artifacts")))
      .send({ name: `A ${name}`, type: "DOCUMENT", checksum: "c1", storageRef: "s1" })
      .expect(201);
    const event = await auth(request(http).post(at("/events")))
      .send({ type: "policy.changed", targetType: "policy", targetId: "p" })
      .expect(201);
    const members = await auth(request(http).get(at("/members"))).expect(200);

    const furnished: Furnished = {
      workspaceId,
      goalId: goal.body.goalId,
      taskId: task.body.taskId,
      artifactId: artifact.body.artifactId,
      decisionId: decision.body.decisionId,
      eventId: event.body.eventId,
      membershipId: members.body[0].membershipId,
    };
    // A probe built on an undefined id gets a 404 that proves nothing — the
    // worst outcome for this suite, since it reads as a pass. Guard it.
    for (const [key, value] of Object.entries(furnished)) {
      expect(`${key}=${String(value)}`).toBe(`${key}=${String(value)}`);
      expect(typeof value === "string" && value.length > 0).toBe(true);
    }
    return furnished;
  }

  /**
   * Every route reachable with `(workspaceId, someObjectId)`. The probe pairs
   * workspace A's prefix with workspace B's ids: each must be refused.
   */
  function probes(here: string, there: Furnished, userId: string) {
    const at = (suffix: string) => `/workspaces/${here}${suffix}`;
    return [
      ["GET", at(`/goals/${there.goalId}`), undefined],
      ["PATCH", at(`/goals/${there.goalId}`), { title: "stolen" }],
      ["POST", at(`/goals/${there.goalId}/status`), { status: "ACTIVE" }],
      ["POST", at(`/goals/${there.goalId}/complete`), {}],
      ["POST", at(`/goals/${there.goalId}/progress`), { progress: 99 }],
      ["POST", at(`/goals/${there.goalId}/dependencies`), { dependsOnGoalId: there.goalId }],
      ["GET", at(`/tasks/${there.taskId}`), undefined],
      ["PATCH", at(`/tasks/${there.taskId}`), { title: "stolen" }],
      ["POST", at(`/tasks/${there.taskId}/assign`), { assigneeType: "HUMAN", assigneeId: userId }],
      ["POST", at(`/tasks/${there.taskId}/status`), { status: "READY" }],
      ["POST", at(`/tasks/${there.taskId}/submit`), {}],
      ["POST", at(`/tasks/${there.taskId}/complete`), {}],
      ["POST", at(`/tasks/${there.taskId}/cancel`), {}],
      ["POST", at(`/tasks/${there.taskId}/blockers`), { type: "TECHNICAL", description: "d" }],
      ["POST", at(`/tasks/${there.taskId}/dependencies`), { dependsOnTaskId: there.taskId }],
      ["GET", at(`/artifacts/${there.artifactId}`), undefined],
      ["PATCH", at(`/artifacts/${there.artifactId}`), { name: "stolen" }],
      ["POST", at(`/artifacts/${there.artifactId}/versions`), { checksum: "c2", storageRef: "s2" }],
      ["POST", at(`/artifacts/${there.artifactId}/status`), { status: "ARCHIVED" }],
      ["POST", at(`/artifacts/${there.artifactId}/links`), { goalId: there.goalId }],
      ["GET", at(`/decisions/${there.decisionId}`), undefined],
      ["POST", at(`/decisions/${there.decisionId}/supersede`), { subject: "t", rationale: "r", outcome: "o" }],
      ["POST", at(`/events/${there.eventId}/receipts`), { actorType: "HUMAN", actorIds: ["x"] }],
      ["POST", at(`/events/${there.eventId}/receipts/mine`), { status: "SEEN" }],
      ["PATCH", at(`/members/${there.membershipId}`), { role: "VIEWER" }],
      ["DELETE", at(`/members/${there.membershipId}`), undefined],
    ] as const;
  }

  it("refuses every route that pairs one workspace with another's object", async () => {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "o@example.com", password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "o@example.com", password: "a-strong-password" })
      .expect(200);
    token = logged.body.accessToken as string;
    const organizationId = registered.body.organizationId as string;

    const userId = logged.body.userId as string;
    const a = await furnish(organizationId, userId, "Alpha");
    const b = await furnish(organizationId, userId, "Beta");

    const leaks: string[] = [];
    for (const [method, url, body] of probes(a.workspaceId, b, userId)) {
      const verbs = request(http) as unknown as Record<
        string,
        (u: string) => request.Test
      >;
      const call = verbs[method.toLowerCase()]!(url);
      const res = await auth(body === undefined ? call : call.send(body));
      // 404 is the right answer: "not yours" must not confirm "it exists".
      if (res.status !== 404) {
        leaks.push(`${method} ${url.replace(b.workspaceId, "<B>")} -> ${res.status}`);
      }
    }

    expect(leaks).toEqual([]);

    // And the objects of B are untouched by everything we just attempted.
    const goal = await auth(
      request(http).get(`/workspaces/${b.workspaceId}/goals/${b.goalId}`),
    ).expect(200);
    expect(goal.body.title).toBe("Goal Beta");
    expect(goal.body.progress).toBe(0);
  });
});
