/**
 * What a finished agent process left behind.
 *
 * `stdout` is present on purpose, and on purpose it is never read by this
 * module: keeping it in the type makes the omission visible and deliberate
 * rather than looking like it was forgotten.
 */
export interface ProcessOutcome {
  exitCode: number | null;
  stderr: string;
  /** The agent's own output. NOT a signal — see the module comment. */
  stdout: string;
  toolErrors: { code: string; message: string }[];
}

export type FailureKind = "QUOTA" | "AUTH";

export interface ProviderFailure {
  kind: FailureKind;
  /** Which process-level channel said so — never "stdout". */
  channel: "stderr" | "exit_code" | "tool_error";
  /** The text that decided it, so the hub can record a real reason (§4.14). */
  evidence: string;
  /** Only when the provider actually gave one; never guessed. */
  retryAfterSeconds: number | null;
}

/**
 * §7.15, and §4.14's "source de détection du quota", verbatim:
 *
 *   "ne doit examiner que des signaux de niveau processus (stderr, code de
 *   sortie, erreurs d'outil structurées), jamais le contenu généré par
 *   l'agent lui-même (stdout, sortie conversationnelle)".
 *
 * Why it matters more than it looks: `ProviderProfile` is a GLOBAL catalogue
 * (§4.14), so one false positive does not inconvenience one agent — it locks
 * out every agent on that provider. An agent writing code that mentions
 * "429", or explaining a rate limit to a human, must never be able to do
 * that (0.3.8).
 *
 * So the function takes stdout and ignores it. Deleting the field would make
 * the rule invisible; keeping it unread makes it a decision.
 */
export function detectProviderFailure(outcome: ProcessOutcome): ProviderFailure | null {
  // A run that succeeded is not an outage, whatever it printed on the way.
  if (outcome.exitCode === 0) {
    return null;
  }

  for (const error of outcome.toolErrors) {
    const kind = classify(`${error.code} ${error.message}`);
    if (kind) {
      return {
        kind,
        channel: "tool_error",
        evidence: `${error.code}: ${error.message}`,
        retryAfterSeconds: retryAfterIn(error.message),
      };
    }
  }

  const kind = classify(outcome.stderr);
  if (kind) {
    return {
      kind,
      channel: "stderr",
      evidence: outcome.stderr.trim().slice(0, 500),
      retryAfterSeconds: retryAfterIn(outcome.stderr),
    };
  }

  // Most failures are the agent's work failing, not the provider. Saying
  // nothing is the correct answer far more often than saying something.
  return null;
}

// No trailing word boundary: "rate_limit_error" is one word to a regex,
// because "_" is a word character — the boundary would refuse the very shape
// providers actually emit.
const QUOTA = /\b(?:429|rate[_ -]?limit|quota[_ -]?exceeded|quota exhausted)/i;
const AUTH =
  /\b(?:401|403|authentication[_ -]?error|invalid[_ -]?api[_ -]?key|token[_ -]?(?:revoked|expired)|unauthorized)/i;

function classify(text: string): FailureKind | null {
  if (QUOTA.test(text)) {
    return "QUOTA";
  }
  if (AUTH.test(text)) {
    return "AUTH";
  }
  return null;
}

/**
 * Only what the provider actually said. Inventing a window here would be this
 * module deciding a policy it has no way to know — and the hub refuses a
 * lockout it cannot explain anyway.
 */
function retryAfterIn(text: string): number | null {
  const match = /retry[_ -]?after[:= ]\s*(\d+)/i.exec(text);
  return match ? Number(match[1]) : null;
}
