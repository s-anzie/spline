import { ActorRef } from "../../identity/domain/actor";
import { AgentSession } from "./agent-session";
import { WorkerNode } from "./worker-node";

const now = new Date("2026-08-04T12:00:00Z");
const later = new Date("2026-08-04T12:10:00Z");
const agent = ActorRef.create("AGENT", "a-1").value;
const operator = ActorRef.create("WORKER", "w-1").value;
const MINUTE = 60 * 1000;

function worker(overrides: Record<string, unknown> = {}) {
  return WorkerNode.register({
    hostname: "workshop-01",
    registeredBy: operator,
    architecture: "x86_64",
    operatingSystem: "linux",
    capabilities: ["docker", "node"],
    now,
    ...overrides,
  });
}

describe("WorkerNode", () => {
  it("records what a machine says about itself at registration (§6.3)", () => {
    const result = worker();

    expect(result.isSuccess).toBe(true);
    expect(result.value.hostname).toBe("workshop-01");
    expect(result.value.capabilities).toEqual(["docker", "node"]);
    expect(result.value.status).toBe("ONLINE");
  });

  it("refuses a machine that cannot say what it is", () => {
    expect(worker({ hostname: " " }).isFailure).toBe(true);
    expect(worker({ architecture: "" }).isFailure).toBe(true);
    expect(worker({ operatingSystem: "  " }).isFailure).toBe(true);
  });

  /** Registering IS a heartbeat: a machine that just spoke is not stale. */
  it("is not stale the instant it registers", () => {
    expect(worker().value.isStaleAt(now, MINUTE)).toBe(false);
  });

  /** §17.7 — judged at read from the last heartbeat, never by a sweep. */
  it("goes stale once its heartbeat is older than the window", () => {
    const node = worker().value;

    expect(node.isStaleAt(new Date(now.getTime() + 30_000), MINUTE)).toBe(false);
    expect(node.isStaleAt(later, MINUTE)).toBe(true);

    node.heartbeat(later);
    expect(node.isStaleAt(later, MINUTE)).toBe(false);
  });

  it("is never stale while deliberately in maintenance — nobody expects it to speak", () => {
    const node = worker().value;
    node.changeStatus("MAINTENANCE", now);

    expect(node.isStaleAt(later, MINUTE)).toBe(false);
  });

  it("comes back online on a heartbeat after being marked offline", () => {
    const node = worker().value;
    node.changeStatus("OFFLINE", now);

    node.heartbeat(later);

    expect(node.status).toBe("ONLINE");
  });

  /**
   * §6.3 and §18.8 — the machine does not belong to the workspace yet, which
   * is exactly what attaching establishes.
   */
  it("serves no workspace until it is attached to one", () => {
    const node = worker().value;
    expect(node.serves("w-1")).toBe(false);

    expect(node.attachTo("w-1", now).isSuccess).toBe(true);

    expect(node.serves("w-1")).toBe(true);
    expect(node.domainEvents.at(-1)?.workspaceId).toBe("w-1");
  });

  it("attaches to several workspaces, and attaching twice changes nothing", () => {
    const node = worker().value;
    node.attachTo("w-1", now);
    node.attachTo("w-2", now);
    node.clearDomainEvents();

    node.attachTo("w-1", now);

    expect(node.workspaceIds).toEqual(["w-1", "w-2"]);
    expect(node.domainEvents).toHaveLength(0);
  });

  it("stops serving a workspace it is detached from", () => {
    const node = worker().value;
    node.attachTo("w-1", now);

    node.detachFrom("w-1", now);

    expect(node.serves("w-1")).toBe(false);
  });

  /** §17.9 lists "Worker Offline" among the alerts. */
  it("announces going offline", () => {
    const node = worker().value;
    node.clearDomainEvents();

    node.changeStatus("OFFLINE", now);

    expect(node.domainEvents[0]?.eventName).toBe("runtime.worker_offline");
  });

  it("answers a transition it is already in without doing anything (§22.6)", () => {
    const node = worker().value;

    expect(node.changeStatus("ONLINE", now).isSuccess).toBe(true);
  });
});

function session(overrides: Record<string, unknown> = {}) {
  return AgentSession.start({
    workspaceId: "w-1",
    agent,
    workerId: "n-1",
    provider: "claude",
    now,
    ...overrides,
  });
}

describe("AgentSession", () => {
  it("starts as an ephemeral instance of a permanent agent (§4.12)", () => {
    const result = session();

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe("STARTING");
    expect(result.value.agent.actorId).toBe("a-1");
    expect(result.value.isLive).toBe(true);
  });

  it("refuses a session with no workspace, worker or provider", () => {
    expect(session({ workspaceId: " " }).isFailure).toBe(true);
    expect(session({ workerId: "" }).isFailure).toBe(true);
    expect(session({ provider: "  " }).isFailure).toBe(true);
  });

  it("moves through its working states", () => {
    const live = session().value;

    expect(live.changeStatus("RUNNING", now).isSuccess).toBe(true);
    expect(live.changeStatus("WAITING", now).isSuccess).toBe(true);
    expect(live.changeStatus("RUNNING", now).isSuccess).toBe(true);
    expect(live.changeStatus("STOPPED", now).isSuccess).toBe(true);
    expect(live.isLive).toBe(false);
  });

  /**
   * §4.12's invariant, verbatim (0.3.4): a transition already satisfied, or
   * one out of a terminal state, gives a TYPED result — never an unhandled
   * exception. This is why `StateMachine` exists at the kernel.
   */
  it("answers a repeated stop without an exception", () => {
    const live = session().value;
    live.changeStatus("STOPPED", now);

    const again = live.changeStatus("STOPPED", later);

    expect(again.isSuccess).toBe(true);
    expect(live.endedAt).toEqual(now);
  });

  it("refuses to leave a terminal state, and says it is terminal", () => {
    const live = session().value;
    live.changeStatus("CRASHED", now, "the worker vanished");

    const result = live.changeStatus("RUNNING", later);

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("InvalidStateTransitionError");
    expect(result.error.fromTerminal).toBe(true);
  });

  /** §17.9 lists "Runtime Crash" among the alerts. */
  it("announces a crash with the reason it was given", () => {
    const live = session().value;
    live.clearDomainEvents();

    live.changeStatus("CRASHED", now, "no heartbeat for ten minutes");

    expect(live.domainEvents[0]?.eventName).toBe("runtime.session_crashed");
    expect(live.endReason).toBe("no heartbeat for ten minutes");
  });

  /**
   * The staleness this used to assert is gone, deliberately.
   *
   * A session judged its own silence against `lastHeartbeatAt`, and nothing
   * ever sent a session heartbeat: the field was written once, at creation.
   * The health probe therefore called every session over five minutes silent,
   * and "Recover lost sessions" would have crashed every healthy agent in the
   * workspace. This test passed the whole time, because a domain method can
   * be correct about a signal that never arrives.
   *
   * What is left is the recording, which is all it ever honestly was.
   */
  it("records when it was last touched, and stops recording once it ends", () => {
    const live = session().value;
    expect(live.lastHeartbeatAt).toEqual(now);

    live.heartbeat(later);
    expect(live.lastHeartbeatAt).toEqual(later);
  });

  it("ignores a heartbeat from a session that has already ended", () => {
    const live = session().value;
    live.changeStatus("STOPPED", now);

    live.heartbeat(later);

    expect(live.lastHeartbeatAt).toEqual(now);
  });

  it("advertises what may happen next (§20.6)", () => {
    const live = session().value;

    expect(live.allowedStatusTargets()).toEqual([
      "IDLE",
      "RUNNING",
      "STOPPED",
      "CRASHED",
    ]);
    live.changeStatus("STOPPED", now);
    expect(live.allowedStatusTargets()).toEqual([]);
  });

  /**
   * §4.12 lists six statuses and `IDLE` is the one nothing reaches — said
   * here so that nobody reads the state machine and assumes otherwise.
   *
   * `IDLE` means an instance that is alive and not working. In this system a
   * session is opened for ONE task and ends with it: STARTING while the order
   * waits, RUNNING while the machine executes, WAITING while somebody else
   * must move, then STOPPED or CRASHED. There is no moment in that life when
   * the agent is alive with nothing to do.
   *
   * Making it real means letting a session serve several tasks — which the
   * provider layer nearly supports already (a run resumes the previous
   * attempt's provider session) but only WITHIN one task. Doing it properly
   * changes three things that are settled today: an IDLE session must not
   * count against `sessionsPerAgent` (the agent is not working), something
   * must end one that lingers, and dispatch must prefer reusing one over
   * opening another. That is a design change, not a missing line, and
   * inventing a meaning for the state to fill the slot would be worse than
   * saying this.
   *
   * The transition itself is legal, so the day a session does outlive a task
   * nothing here has to move.
   */
  it("leaves IDLE reachable in the machine and unreached by this system", () => {
    const live = session().value;

    expect(live.allowedStatusTargets()).toContain("IDLE");
    expect(live.changeStatus("IDLE", now).isSuccess).toBe(true);

    // And from there, back to work or out — nothing is a dead end.
    expect(live.allowedStatusTargets()).toEqual(
      expect.arrayContaining(["RUNNING", "STOPPED", "CRASHED"]),
    );
  });

});
