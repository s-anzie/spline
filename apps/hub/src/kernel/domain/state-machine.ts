/**
 * Transversal rule from v3 spec §22.6, shared by every state machine in the
 * system: transitioning to the current state is an idempotent no-op success,
 * an invalid transition returns a typed outcome (flagging whether it was
 * attempted from a terminal state), and nothing here ever throws.
 */
export type TransitionOutcome<S extends string> =
  | { kind: "transitioned"; from: S; to: S }
  | { kind: "alreadyInState"; state: S }
  | { kind: "invalidTransition"; from: S; to: S; fromTerminal: boolean };

export class StateMachine<S extends string> {
  constructor(private readonly transitions: Readonly<Record<S, readonly S[]>>) {}

  can(from: S, to: S): boolean {
    return this.transitions[from].includes(to);
  }

  /** A state with no outgoing transitions is terminal. */
  isTerminal(state: S): boolean {
    return this.transitions[state].length === 0;
  }

  /**
   * Reachable targets from a state — the affordances an interface can
   * surface before the user hits a rejection (v3 spec §20.6).
   */
  allowedFrom(state: S): readonly S[] {
    return [...this.transitions[state]];
  }

  transition(from: S, to: S): TransitionOutcome<S> {
    if (from === to) {
      return { kind: "alreadyInState", state: from };
    }
    if (!this.can(from, to)) {
      return {
        kind: "invalidTransition",
        from,
        to,
        fromTerminal: this.isTerminal(from),
      };
    }
    return { kind: "transitioned", from, to };
  }
}
