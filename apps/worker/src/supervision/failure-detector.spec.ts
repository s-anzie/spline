import { detectProviderFailure, ProcessOutcome } from "./failure-detector";

function outcome(overrides: Partial<ProcessOutcome> = {}): ProcessOutcome {
  return {
    exitCode: 0,
    stderr: "",
    stdout: "",
    toolErrors: [],
    ...overrides,
  };
}

describe("detectProviderFailure", () => {
  it("finds nothing wrong with a clean run", () => {
    expect(detectProviderFailure(outcome())).toBeNull();
  });

  /**
   * §7.15 and §4.14 (0.3.8), the rule this module exists to hold:
   *
   *   "ne doit examiner que les canaux de niveau processus — stderr, code de
   *   sortie, erreurs d'outil structurées — jamais stdout ou tout canal qui
   *   transporte le contenu généré par l'agent lui-même."
   *
   * The consequence is what makes it serious: ProviderProfile is a GLOBAL
   * catalogue (§4.14), so one false positive locks out every agent on that
   * provider — not just the one that said it.
   */
  describe("stdout is never read, whatever it says", () => {
    it.each([
      "the API returned 429 Too Many Requests",
      "authentication_error: invalid api key",
      "rate limit exceeded",
      "quota exhausted, retry after 3600s",
      'if (res.status === 429) { throw new Error("rate limit"); }',
    ])("ignores %j on stdout", (text) => {
      expect(detectProviderFailure(outcome({ stdout: text }))).toBeNull();
    });

    it("ignores it even when the run also failed for an unrelated reason", () => {
      // The exit code says something went wrong; stdout still says nothing
      // about the provider. An agent writing about rate limits while its
      // build fails must not take the provider down with it.
      const failure = detectProviderFailure(
        outcome({ exitCode: 1, stdout: "429 rate limit", stderr: "tsc: 3 errors" }),
      );

      expect(failure).toBeNull();
    });
  });

  describe("process-level signals are read", () => {
    it("recognises a rate limit on stderr", () => {
      const failure = detectProviderFailure(
        outcome({ exitCode: 1, stderr: "Error: 429 rate_limit_error" }),
      );

      expect(failure?.kind).toBe("QUOTA");
      // The evidence travels with the verdict: §17.8, and the hub records it
      // as the reason (§4.14 refuses a lockout with no reason).
      expect(failure?.evidence).toContain("429");
      expect(failure?.channel).toBe("stderr");
    });

    it("recognises an authentication failure on stderr", () => {
      const failure = detectProviderFailure(
        outcome({ exitCode: 1, stderr: "authentication_error: token revoked" }),
      );

      expect(failure?.kind).toBe("AUTH");
    });

    it("reads a structured tool error, which is a process-level channel", () => {
      const failure = detectProviderFailure(
        outcome({
          exitCode: 1,
          toolErrors: [{ code: "rate_limit_error", message: "slow down" }],
        }),
      );

      expect(failure?.kind).toBe("QUOTA");
      expect(failure?.channel).toBe("tool_error");
    });

    it("says nothing about a plain failure with no provider signal", () => {
      // Most failures are the agent's work failing, not the provider.
      expect(
        detectProviderFailure(outcome({ exitCode: 1, stderr: "tsc: 3 errors" })),
      ).toBeNull();
    });

    it("says nothing when stderr mentions it but the run succeeded", () => {
      // A warning on stderr of a successful run is not an outage.
      expect(
        detectProviderFailure(outcome({ exitCode: 0, stderr: "warn: 429 retried once" })),
      ).toBeNull();
    });
  });

  it("carries a retry window when the provider gave one", () => {
    const failure = detectProviderFailure(
      outcome({ exitCode: 1, stderr: "429 rate_limit_error; retry-after: 120" }),
    );

    expect(failure?.retryAfterSeconds).toBe(120);
  });

  it("leaves the window unknown rather than inventing one", () => {
    const failure = detectProviderFailure(
      outcome({ exitCode: 1, stderr: "429 rate_limit_error" }),
    );

    // The hub needs a window to lock a provider; guessing one here would be
    // this module deciding a policy it cannot know.
    expect(failure?.retryAfterSeconds).toBeNull();
  });
});
