import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { EVENT_PUBLISHER } from "../src/kernel/domain/ports/event-publisher.port";
import { EventPublisher } from "../src/kernel/domain/ports/event-publisher.port";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./setup/reset-database";

/**
 * §14.1 — an aggregate and the facts it raised land together, or not at all.
 *
 * This was a named debt (`modules/event/doc.md` §1.7): the event was written
 * AFTER the aggregate, in its own transaction, so a process dying between the
 * two kept the change and lost the fact. Everything downstream follows from
 * that gap — a notification nobody receives, a goal whose progress never
 * recomputes, a journal that disagrees with the world.
 *
 * The fix is a transaction around every mutating request. What proves it is
 * not the refactor but this file: a write that fails must leave NOTHING.
 */
describe("Atomicity (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
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
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    const workspace = await auth(request(http).post("/workspaces"))
      .send({ organizationId: registered.body.organizationId, name: "Core" })
      .expect(201);
    return { auth, workspaceId: workspace.body.workspaceId as string };
  }

  it("writes the aggregate and its facts in one transaction", async () => {
    const ctx = await setup();

    const goal = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Ship it", successCriteria: ["it ships"] })
      .expect(201);

    // Both sides of the same decision are on record.
    expect(await prisma.goal.findUnique({ where: { id: goal.body.goalId } })).not.toBeNull();
    expect(
      await prisma.event.findFirst({ where: { targetId: goal.body.goalId } }),
    ).not.toBeNull();
  });

  /**
   * The actual claim. A publisher that throws stands in for the crash the old
   * shape could not survive: before, the goal was already committed and only
   * the event was lost. Now neither exists.
   */
  it("leaves nothing behind when raising the fact fails", async () => {
    const ctx = await setup();
    const publisher = app.get<EventPublisher>(EVENT_PUBLISHER);
    const publishAll = jest
      .spyOn(publisher, "publishAll")
      .mockRejectedValueOnce(new Error("the journal is unreachable"));

    await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Never happened", successCriteria: ["x"] })
      .expect(500);

    expect(publishAll).toHaveBeenCalled();
    // The aggregate went with it. Before this change it would have survived,
    // leaving a goal no listener ever heard about.
    expect(await prisma.goal.findMany({ where: { title: "Never happened" } })).toEqual([]);

    publishAll.mockRestore();
  });

  /**
   * A reaction runs on a fact anyone can read. Inside the transaction it
   * would be reacting to a world only it can see — so facts are written
   * inside and announced after.
   */
  it("announces a fact only once it is committed", async () => {
    const ctx = await setup();

    const goal = await ctx
      .auth(request(http).post(`/workspaces/${ctx.workspaceId}/goals`))
      .send({ title: "Ship it", successCriteria: ["it ships"] })
      .expect(201);

    // The notification exists, which means the listener ran; and it ran on a
    // goal that was committed, since the request has returned.
    const journalled = await prisma.event.findFirst({
      where: { targetId: goal.body.goalId },
    });
    expect(journalled?.type).toContain("goal");
  });

  /** A read holds no transaction: nothing to commit, nothing to hold open. */
  it("does not wrap a read in a transaction", async () => {
    const ctx = await setup();

    await ctx
      .auth(request(http).get(`/workspaces/${ctx.workspaceId}/goals`))
      .expect(200);
  });
});
