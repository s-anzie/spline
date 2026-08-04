import { ActorRef } from "../../identity/domain/actor";
import { Notification } from "./notification";

const now = new Date("2026-08-04T10:00:00Z");
const author = ActorRef.create("HUMAN", "u-1").value;

function send(overrides: Record<string, unknown> = {}) {
  return Notification.send({
    workspaceId: "w-1",
    kind: "CHAT_MESSAGE",
    title: "Deploy is blocked",
    body: "The staging database refuses connections.",
    scope: "DIRECT",
    createdBy: author,
    now,
    ...overrides,
  });
}

describe("Notification", () => {
  it("records what was said, by whom, to which audience", () => {
    const result = send();

    expect(result.isSuccess).toBe(true);
    const notification = result.value;
    expect(notification.workspaceId).toBe("w-1");
    expect(notification.kind).toBe("CHAT_MESSAGE");
    expect(notification.scope).toBe("DIRECT");
    expect(notification.createdBy.actorId).toBe("u-1");
    expect(notification.createdAt).toEqual(now);
  });

  it("refuses a message with no workspace: isolation is not optional (§4.2)", () => {
    expect(send({ workspaceId: "  " }).isFailure).toBe(true);
  });

  it("refuses an empty title or body — an addressed message must say something", () => {
    expect(send({ title: "" }).isFailure).toBe(true);
    expect(send({ body: "   " }).isFailure).toBe(true);
  });

  /**
   * §4.18 unifies chat and alerts on purpose (v1 lesson): one fan-out, one
   * read model, one acknowledgement path for both.
   */
  it("carries a system alert on the very same model as a chat message", () => {
    const alert = send({
      kind: "SYSTEM_ALERT",
      scope: "BROADCAST",
      title: "Worker offline",
      body: "worker-2 stopped reporting.",
    });

    expect(alert.isSuccess).toBe(true);
    expect(alert.value.kind).toBe("SYSTEM_ALERT");
  });

  it("raises one domain event carrying the workspace", () => {
    const notification = send().value;

    expect(notification.domainEvents).toHaveLength(1);
    expect(notification.domainEvents[0]?.eventName).toBe("notification.sent");
    expect(notification.domainEvents[0]?.workspaceId).toBe("w-1");
  });

  /** Like Event and Decision: a sent message is not edited, it is answered. */
  it("exposes no mutation whatsoever", () => {
    const notification = send().value;
    const mutators = Object.getOwnPropertyNames(
      Object.getPrototypeOf(notification) as object,
    ).filter((name) => /^(update|change|set|edit|delete|archive)/.test(name));

    expect(mutators).toEqual([]);
  });
});
