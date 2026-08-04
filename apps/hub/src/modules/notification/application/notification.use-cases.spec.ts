import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { ActorRef } from "../../identity/domain/actor";
import { InMemoryTaskRepository } from "../../task/application/testing/task.doubles";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/workspace.doubles";
import { Workspace } from "../../workspace/domain/workspace";
import { AdvanceRecipientUseCase } from "./advance-recipient.use-case";
import { ListNotificationsUseCase } from "./list-notifications.use-case";
import { ListUnreadUseCase } from "./list-unread.use-case";
import { SendNotificationUseCase } from "./send-notification.use-case";
import {
  FakeWorkspaceAudience,
  InMemoryNotificationRecipientRepository,
  InMemoryNotificationRepository,
} from "./testing/notification.doubles";

const now = new Date("2026-08-04T10:00:00Z");

async function setup() {
  const clock = new FakeClock(now);
  const publisher = new FakeEventPublisher();
  const notifications = new InMemoryNotificationRepository();
  const recipients = new InMemoryNotificationRecipientRepository(notifications);
  const workspaces = new InMemoryWorkspaceRepository();
  const tasks = new InMemoryTaskRepository();
  const audience = new FakeWorkspaceAudience();

  const workspace = Workspace.create({ organizationId: "org-1", name: "W", now }).value;
  await workspaces.save(workspace);
  const workspaceId = workspace.id.value;

  audience.set(workspaceId, [
    ActorRef.create("AGENT", "a-1").value,
    ActorRef.create("AGENT", "a-2").value,
    ActorRef.create("AGENT", "a-3").value,
  ]);

  return {
    workspaceId,
    workspaces,
    clock,
    publisher,
    notifications,
    recipients,
    audience,
    send: new SendNotificationUseCase(
      notifications,
      workspaces,
      tasks,
      audience,
      clock,
      publisher,
    ),
    unread: new ListUnreadUseCase(recipients),
    advance: new AdvanceRecipientUseCase(recipients, clock, publisher),
    list: new ListNotificationsUseCase(notifications),
  };
}

function direct(workspaceId: string, to: string) {
  return {
    workspaceId,
    kind: "CHAT_MESSAGE" as const,
    scope: "DIRECT" as const,
    title: "A question",
    body: "Can you take this over?",
    createdByType: "HUMAN" as const,
    createdById: "u-1",
    recipients: [{ actorType: "AGENT" as const, actorId: to }],
  };
}

describe("notification use-cases", () => {
  it("materialises one recipient row per addressee at creation (§4.19)", async () => {
    const ctx = await setup();

    const result = await ctx.send.execute(direct(ctx.workspaceId, "a-1"));

    expect(result.isSuccess).toBe(true);
    const rows = await ctx.recipients.listByNotification(
      ctx.workspaceId,
      result.value.notificationId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recipient.actorId).toBe("a-1");
    expect(rows[0]?.deliveryStatus).toBe("PENDING");
  });

  it("resolves a broadcast to real members, not to the string 'all'", async () => {
    const ctx = await setup();

    const result = await ctx.send.execute({
      ...direct(ctx.workspaceId, "a-1"),
      scope: "BROADCAST",
      recipients: undefined,
    });

    const rows = await ctx.recipients.listByNotification(
      ctx.workspaceId,
      result.value.notificationId,
    );
    expect(rows.map((r) => r.recipient.actorId).sort()).toEqual(["a-1", "a-2", "a-3"]);
  });

  it("refuses a message addressed to nobody", async () => {
    const ctx = await setup();
    ctx.audience.set(ctx.workspaceId, []);

    const result = await ctx.send.execute({
      ...direct(ctx.workspaceId, "a-1"),
      scope: "BROADCAST",
      recipients: undefined,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("NoRecipientsError");
  });

  it("refuses a workspace that does not exist", async () => {
    const ctx = await setup();

    const result = await ctx.send.execute(direct("ghost", "a-1"));

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("WorkspaceNotFoundError");
  });

  it("refuses a thread anchored on a task from another workspace", async () => {
    const ctx = await setup();

    const result = await ctx.send.execute({
      ...direct(ctx.workspaceId, "a-1"),
      taskId: "ghost-task",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("TaskNotFoundError");
  });

  /**
   * §26, word for word: "sent to several agents, one agent reads it, the
   * unread query no longer returns it for them but still does for the
   * others" — inside a single workspace. This is the acceptance criterion
   * that the previous tool failed in production.
   */
  it("gives a broadcast an individual read state per recipient", async () => {
    const ctx = await setup();
    const sent = await ctx.send.execute({
      ...direct(ctx.workspaceId, "a-1"),
      scope: "BROADCAST",
      recipients: undefined,
    });
    const notificationId = sent.value.notificationId;

    const unreadFor = async (actorId: string) =>
      (
        await ctx.unread.execute({
          workspaceId: ctx.workspaceId,
          actorType: "AGENT",
          actorId,
        })
      ).value;

    expect(await unreadFor("a-1")).toHaveLength(1);
    expect(await unreadFor("a-2")).toHaveLength(1);
    expect(await unreadFor("a-3")).toHaveLength(1);

    const read = await ctx.advance.execute({
      workspaceId: ctx.workspaceId,
      notificationId,
      actorType: "AGENT",
      actorId: "a-2",
      status: "SEEN",
    });
    expect(read.isSuccess).toBe(true);

    expect(await unreadFor("a-2")).toHaveLength(0);
    expect(await unreadFor("a-1")).toHaveLength(1);
    expect(await unreadFor("a-3")).toHaveLength(1);
  });

  it("refuses to advance a recipient the caller is not", async () => {
    const ctx = await setup();
    const sent = await ctx.send.execute(direct(ctx.workspaceId, "a-1"));

    const result = await ctx.advance.execute({
      workspaceId: ctx.workspaceId,
      notificationId: sent.value.notificationId,
      actorType: "AGENT",
      actorId: "a-2",
      status: "SEEN",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("NotificationRecipientNotFoundError");
  });

  it("never returns the unread of another workspace", async () => {
    const ctx = await setup();
    const other = Workspace.create({ organizationId: "org-1", name: "Other", now }).value;
    await ctx.workspaces.save(other);
    ctx.audience.set(other.id.value, []);
    await ctx.send.execute(direct(ctx.workspaceId, "a-1"));

    const elsewhere = await ctx.unread.execute({
      workspaceId: other.id.value,
      actorType: "AGENT",
      actorId: "a-1",
    });

    expect(elsewhere.value).toHaveLength(0);
  });

  it("lists a workspace's notifications, filtered by kind", async () => {
    const ctx = await setup();
    await ctx.send.execute(direct(ctx.workspaceId, "a-1"));
    await ctx.send.execute({
      ...direct(ctx.workspaceId, "a-1"),
      kind: "SYSTEM_ALERT",
      title: "Worker offline",
    });

    const all = await ctx.list.execute({ workspaceId: ctx.workspaceId });
    const alerts = await ctx.list.execute({
      workspaceId: ctx.workspaceId,
      kind: "SYSTEM_ALERT",
    });

    expect(all.value).toHaveLength(2);
    expect(alerts.value).toHaveLength(1);
    expect(alerts.value[0]?.title).toBe("Worker offline");
  });
});
