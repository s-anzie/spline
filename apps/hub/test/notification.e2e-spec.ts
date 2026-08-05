import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GrantWorkspaceMembershipUseCase } from "../src/modules/identity/application/grant-workspace-membership.use-case";
import { IssueActorCredentialUseCase } from "../src/modules/identity/application/issue-actor-credential.use-case";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

describe("Notification (e2e)", () => {
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

  async function setup() {
    const registered = await request(http)
      .post("/auth/register")
      .send({ email: "owner@example.com", password: "a-strong-password", displayName: "O" })
      .expect(201);
    const logged = await request(http)
      .post("/auth/login")
      .send({ email: "owner@example.com", password: "a-strong-password" })
      .expect(200);
    const token = logged.body.accessToken as string;
    const workspace = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: registered.body.organizationId, name: "Core" })
      .expect(201);
    const workspaceId = workspace.body.workspaceId as string;

    const tokens: Record<string, string> = {};
    for (const agentId of ["a-1", "a-2", "a-3"]) {
      const issued = await app
        .get(IssueActorCredentialUseCase)
        .execute({
          actorType: "AGENT",
          actorId: agentId,
          organizationId: registered.body.organizationId as string,
          displayName: agentId,
        });
      tokens[agentId] = issued.value.token;
      await app.get(GrantWorkspaceMembershipUseCase).execute({
        actorType: "AGENT",
        actorId: agentId,
        workspaceId,
        role: "AGENT_CONTRIBUTOR",
      });
    }

    return {
      token,
      tokens,
      userId: logged.body.userId as string,
      organizationId: registered.body.organizationId as string,
      workspaceId,
      base: `/workspaces/${workspaceId}/notifications`,
    };
  }

  /**
   * §26, verbatim: "a broadcast message or notification has an individual,
   * reliable read state per recipient, automatically tested: sent to several
   * agents, one agent reads it, the unread query no longer returns it for
   * them but still does for the other two". This is the criterion the
   * previous tool failed in production, and the reason NotificationRecipient
   * exists at all.
   */
  it("gives a broadcast an individual read state per recipient (§26)", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (id: string) => (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens[id]}`);

    const sent = await asOwner(request(http).post(ctx.base))
      .send({
        kind: "SYSTEM_ALERT",
        scope: "BROADCAST",
        title: "Deployment window closes at 18:00",
        body: "Land what you have or hold it for tomorrow.",
      })
      .expect(201);
    // The owner is a member too, so the fan-out is the three agents plus them.
    expect(sent.body.recipientCount).toBe(4);

    const unreadFor = async (id: string) =>
      (
        await asAgent(id)(request(http).get(`${ctx.base}/unread/mine`)).expect(200)
      ).body;

    expect(await unreadFor("a-1")).toHaveLength(1);
    expect(await unreadFor("a-2")).toHaveLength(1);
    expect(await unreadFor("a-3")).toHaveLength(1);

    await asAgent("a-2")(
      request(http).post(`${ctx.base}/${sent.body.notificationId}/mine`),
    )
      .send({ status: "SEEN" })
      .expect(200);

    expect(await unreadFor("a-2")).toHaveLength(0);
    expect(await unreadFor("a-1")).toHaveLength(1);
    expect(await unreadFor("a-3")).toHaveLength(1);
  });

  it("carries an acknowledgement forward, and refuses to skip a step", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const asAgent = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-1"]}`);

    const sent = await asOwner(request(http).post(ctx.base))
      .send({
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: "Can you take the migration?",
        body: "It needs to land before the window closes.",
        recipients: [{ actorType: "AGENT", actorId: "a-1" }],
      })
      .expect(201);
    const mine = `${ctx.base}/${sent.body.notificationId}/mine`;

    // Acting on what was never acknowledged is refused.
    await asAgent(request(http).post(mine)).send({ status: "ACTED_ON" }).expect(409);

    // A recipient who polled was never "delivered" to — going straight to
    // SEEN is legitimate, and the affordances say so.
    const unread = await asAgent(
      request(http).get(`${ctx.base}/unread/mine`),
    ).expect(200);
    expect(unread.body[0].allowedStatusTargets).toEqual([
      "DELIVERED",
      "SEEN",
      "FAILED",
    ]);

    for (const status of ["SEEN", "ACKNOWLEDGED", "ACTED_ON"] as const) {
      await asAgent(request(http).post(mine)).send({ status }).expect(200);
    }
    expect((await asAgent(request(http).get(`${ctx.base}/unread/mine`))).body).toHaveLength(
      0,
    );
  });

  /** §4.6 — a task has one owner from creation, and that owner is told. */
  it("tells an assignee that a task became theirs", async () => {
    const ctx = await setup();
    const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ctx.token}`);
    const goal = await asOwner(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Ship", successCriteria: ["it works"] })
      .expect(201);

    const task = await asOwner(request(http).post(`/workspaces/${ctx.workspaceId}/tasks`))
      .send({
        goalId: goal.body.goalId,
        title: "Wire the daemon",
        acceptanceCriteria: ["it connects"],
        assigneeType: "AGENT",
        assigneeId: "a-1",
      })
      .expect(201);

    const unread = await request(http)
      .get(`${ctx.base}/unread/mine`)
      .set("Authorization", `Bearer ${ctx.tokens["a-1"]}`)
      .expect(200);

    const about = unread.body.find(
      (entry: { notification: { taskId: string } }) =>
        entry.notification.taskId === task.body.taskId,
    );
    expect(about).toBeDefined();
    expect(about.notification.kind).toBe("SYSTEM_ALERT");
  });

  it("refuses a message addressed to nobody", async () => {
    const ctx = await setup();

    await request(http)
      .post(ctx.base)
      .set("Authorization", `Bearer ${ctx.token}`)
      .send({
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: "Into the void",
        body: "Nobody will read this.",
        recipients: [],
      })
      .expect(409);
  });

  /** §4.2 — the sibling of the hole found in event receipts. */
  it("never returns another workspace's unread, nor advances its rows", async () => {
    const ctx = await setup();
    const second = await request(http)
      .post("/workspaces")
      .set("Authorization", `Bearer ${ctx.token}`)
      .send({ organizationId: ctx.organizationId, name: "Other" })
      .expect(201);
    const otherId = second.body.workspaceId as string;
    await app.get(GrantWorkspaceMembershipUseCase).execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId: otherId,
      role: "AGENT_CONTRIBUTOR",
    });

    const sentElsewhere = await request(http)
      .post(`/workspaces/${otherId}/notifications`)
      .set("Authorization", `Bearer ${ctx.token}`)
      .send({
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: "Elsewhere",
        body: "This belongs to the other workspace.",
        recipients: [{ actorType: "AGENT", actorId: "a-1" }],
      })
      .expect(201);

    const asAgent = (r: request.Test) =>
      r.set("Authorization", `Bearer ${ctx.tokens["a-1"]}`);

    // Nothing here: the message lives in the other workspace.
    expect(
      (await asAgent(request(http).get(`${ctx.base}/unread/mine`)).expect(200)).body,
    ).toHaveLength(0);

    // And it cannot be acknowledged through this workspace's URL either.
    await asAgent(
      request(http).post(`${ctx.base}/${sentElsewhere.body.notificationId}/mine`),
    )
      .send({ status: "SEEN" })
      .expect(404);
  });

  it("requires authentication and membership", async () => {
    const ctx = await setup();
    await request(http).get(`${ctx.base}/unread/mine`).expect(401);

    await request(http)
      .post("/auth/register")
      .send({ email: "s@example.com", password: "a-strong-password", displayName: "S" })
      .expect(201);
    const stranger = await request(http)
      .post("/auth/login")
      .send({ email: "s@example.com", password: "a-strong-password" })
      .expect(200);

    await request(http)
      .get(ctx.base)
      .set("Authorization", `Bearer ${stranger.body.accessToken}`)
      .expect(403);
  });
});
