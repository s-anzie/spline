import { StateMachine } from "./state-machine";

/**
 * v3 spec §22.6 — transversal rule for every state machine in the system:
 * a transition to the current state is an idempotent no-op success, an
 * invalid transition returns a typed outcome (flagging terminal states),
 * and nothing ever throws.
 */
type SessionState = "starting" | "running" | "stopped" | "crashed";

const machine = new StateMachine<SessionState>({
  starting: ["running", "crashed"],
  running: ["stopped", "crashed"],
  stopped: [],
  crashed: [],
});

describe("StateMachine", () => {
  describe("valid transitions", () => {
    it("allows a declared transition", () => {
      const outcome = machine.transition("starting", "running");

      expect(outcome).toEqual({ kind: "transitioned", from: "starting", to: "running" });
    });

    it("can() mirrors the transition table", () => {
      expect(machine.can("running", "stopped")).toBe(true);
      expect(machine.can("stopped", "running")).toBe(false);
    });
  });

  describe("idempotent same-state transition (§22.6)", () => {
    it("returns alreadyInState instead of failing", () => {
      const outcome = machine.transition("running", "running");

      expect(outcome).toEqual({ kind: "alreadyInState", state: "running" });
    });

    it("treats same-state on a terminal state as alreadyInState too", () => {
      const outcome = machine.transition("stopped", "stopped");

      expect(outcome).toEqual({ kind: "alreadyInState", state: "stopped" });
    });
  });

  describe("invalid transitions (§22.6)", () => {
    it("returns a typed outcome, never throws", () => {
      const outcome = machine.transition("starting", "stopped");

      expect(outcome).toEqual({
        kind: "invalidTransition",
        from: "starting",
        to: "stopped",
        fromTerminal: false,
      });
    });

    it("flags transitions attempted from a terminal state", () => {
      const outcome = machine.transition("crashed", "running");

      expect(outcome).toEqual({
        kind: "invalidTransition",
        from: "crashed",
        to: "running",
        fromTerminal: true,
      });
    });
  });

  describe("terminal states", () => {
    it("a state with no outgoing transitions is terminal", () => {
      expect(machine.isTerminal("stopped")).toBe(true);
      expect(machine.isTerminal("crashed")).toBe(true);
      expect(machine.isTerminal("running")).toBe(false);
    });
  });
});
