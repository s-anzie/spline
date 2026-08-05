import { ActorRef } from "../../identity/domain/actor";
import { MAX_TURN_BUDGET, Thread } from "./thread";

const now = new Date("2026-08-05T12:00:00.000Z");
const later = new Date("2026-08-05T12:01:00.000Z");
const asker = ActorRef.create("AGENT", "a-asker").value;
const answerer = ActorRef.create("AGENT", "a-answerer").value;
const stranger = ActorRef.create("AGENT", "a-stranger").value;

function opened(overrides: Record<string, unknown> = {}) {
  return Thread.open({
    workspaceId: "w-1",
    initiator: asker,
    participant: answerer,
    subject: "Can you review the migration?",
    taskId: null,
    turnBudget: 5,
    now,
    ...overrides,
  });
}

describe("Thread", () => {
  it("opens with the asker's own turn already spent", () => {
    const thread = opened().value;

    expect(thread.status).toBe("OPEN");
    expect(thread.turns).toHaveLength(1);
    expect(thread.turns[0]?.actor.actorId).toBe("a-asker");
    expect(thread.turnsLeft).toBe(4);
  });

  it("refuses a thread with no subject to speak about", () => {
    expect(opened({ subject: "  " }).isFailure).toBe(true);
  });

  /**
   * §10.18a — the gap this exists to close. Assignment tells someone to do
   * something; nobody waits, and nothing links what came back to who asked.
   * A thread that carries a task is the link.
   */
  it("can carry the task it delegates, so a result has somewhere to return", () => {
    const thread = opened({ taskId: "t-1" }).value;

    expect(thread.taskId).toBe("t-1");
    expect(thread.isAwaiting).toBe(true);
  });

  it("is not awaiting anything when it delegates no task", () => {
    expect(opened().value.isAwaiting).toBe(false);
  });

  describe("who may speak", () => {
    it("lets the two participants take turns", () => {
      const thread = opened().value;

      expect(thread.reply(answerer, "Looks fine to me", later).isSuccess).toBe(true);
      expect(thread.reply(asker, "Thanks", later).isSuccess).toBe(true);
    });

    /**
     * §10.18c's hook. A thread has exactly two participants, so "who may
     * speak to whom" is a question with somewhere to live — which is what
     * §10.18 said had to exist before a policy could decide anything.
     */
    it("refuses anyone else, however much they are in the workspace", () => {
      const thread = opened().value;

      const refused = thread.reply(stranger, "Actually…", later);

      expect(refused.isFailure).toBe(true);
      expect(refused.error?.name).toBe("NotAParticipantError");
    });
  });

  /**
   * §10.18b — OpenClaw caps agent-to-agent exchanges at five turns. Spline
   * had no bound at all: two actors answering each other, each in its own
   * request, loop forever. `ReactionDepth` bounds the technical cascade and
   * cannot see this, because each turn is a separate call.
   */
  describe("the budget", () => {
    it("ends the thread when the turns run out, without losing what was said", () => {
      const thread = opened({ turnBudget: 3 }).value;
      thread.reply(answerer, "one", later);
      thread.reply(asker, "two", later);

      const over = thread.reply(answerer, "three", later);

      expect(over.isFailure).toBe(true);
      expect(thread.status).toBe("EXHAUSTED");
      expect(thread.turns).toHaveLength(3);
    });

    it("refuses a budget nobody could hold a conversation in", () => {
      expect(opened({ turnBudget: 0 }).isFailure).toBe(true);
    });

    it("refuses a budget large enough to be no budget at all", () => {
      expect(opened({ turnBudget: MAX_TURN_BUDGET + 1 }).isFailure).toBe(true);
    });

    it("reports what is left, so a caller can decide before spending it", () => {
      const thread = opened({ turnBudget: 3 }).value;
      thread.reply(answerer, "one", later);

      expect(thread.turnsLeft).toBe(1);
    });
  });

  /**
   * §10.18b's other half: a token that says "I have nothing to add". Without
   * it, ending politely and ending because the budget ran out are the same
   * event, and nobody can tell a finished conversation from a truncated one.
   */
  describe("explicit termination", () => {
    it("closes when a participant says they have nothing to add", () => {
      const thread = opened().value;

      const closed = thread.concede(answerer, later);

      expect(closed.isSuccess).toBe(true);
      expect(thread.status).toBe("CLOSED");
    });

    it("distinguishes a finished conversation from a truncated one", () => {
      const finished = opened().value;
      finished.concede(answerer, later);

      const truncated = opened({ turnBudget: 1 }).value;
      truncated.reply(answerer, "one", later);

      expect(finished.status).toBe("CLOSED");
      expect(truncated.status).toBe("EXHAUSTED");
    });

    it("refuses to speak once it is over", () => {
      const thread = opened().value;
      thread.concede(answerer, later);

      expect(thread.reply(asker, "one more thing", later).isFailure).toBe(true);
    });

    it("refuses a concession from somebody who is not in it", () => {
      const thread = opened().value;

      expect(thread.concede(stranger, later).isFailure).toBe(true);
    });
  });

  /** §10.18a — the answer comes back to the one who asked. */
  describe("answering a delegation", () => {
    it("records the outcome and closes the wait", () => {
      const thread = opened({ taskId: "t-1" }).value;

      const answered = thread.deliver(answerer, { status: "COMPLETED" }, later);

      expect(answered.isSuccess).toBe(true);
      expect(thread.status).toBe("ANSWERED");
      expect(thread.outcome).toEqual({ status: "COMPLETED" });
      expect(thread.isAwaiting).toBe(false);
    });

    it("refuses to deliver an answer to a thread that asked for nothing", () => {
      expect(opened().value.deliver(answerer, { status: "COMPLETED" }, later).isFailure).toBe(
        true,
      );
    });

    it("refuses a second answer: a delegation is answered once", () => {
      const thread = opened({ taskId: "t-1" }).value;
      thread.deliver(answerer, { status: "COMPLETED" }, later);

      expect(thread.deliver(answerer, { status: "FAILED" }, later).isFailure).toBe(true);
    });
  });

  /** §20.6 — the affordances, before the refusal. */
  it("says what can still happen to it", () => {
    expect(opened().value.allowedStatusTargets()).toEqual([
      "ANSWERED",
      "CLOSED",
      "EXHAUSTED",
    ]);
  });
});
