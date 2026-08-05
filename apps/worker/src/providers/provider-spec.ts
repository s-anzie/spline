/**
 * §4.14, §7.1 — how this worker drives a coding CLI.
 *
 * The shape is taken from OpenClaw's CLI backends, which solved the same
 * problem: a provider is described by how to start it, how to resume it, and
 * how to read what it said. Everything provider-specific lives in one object
 * so adding a third is data rather than a branch in the executor.
 *
 * The one place this deliberately improves on theirs: where a CLI accepts an
 * ASSIGNED session id, we assign it. Capturing the id from the output — their
 * only mechanism — means a run that dies between the spawn and the parse can
 * never be resumed, because nobody ever learned what to resume.
 */

export interface ProviderResult {
  /** What the agent finally said. Never interpreted, only carried (§7.15). */
  finalText: string;
  /**
   * §4.8's resume key. Null when the CLI reported none — which is a run that
   * cannot be resumed, and must be recorded as such rather than guessed.
   */
  sessionId: string | null;
  tokenUsage: Record<string, number> | null;
  cost: number | null;
}

export type ParseResult =
  | { isFailure: false; value: ProviderResult; error?: undefined }
  | { isFailure: true; error: string; value?: undefined };

export interface ProviderSpec {
  /** A program name — `planSpawn` refuses a path, and the allowlist decides. */
  command: string;
  /**
   * Whether this CLI can be TOLD its session id. When it can, the id exists
   * before the process does; when it cannot, it is read from the output and a
   * crash loses it.
   */
  assignsSessionId: boolean;
  startArgs(prompt: string, sessionId: string): string[];
  resumeArgs?(prompt: string, sessionId: string): string[];
  parse(stdout: string): ParseResult;
}

function failed(error: string): ParseResult {
  return { isFailure: true, error };
}

function usageOf(value: unknown): Record<string, number> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const numbers = Object.entries(value as Record<string, unknown>).filter(
    ([, item]) => typeof item === "number",
  ) as [string, number][];
  return numbers.length > 0 ? Object.fromEntries(numbers) : null;
}

/**
 * Claude Code, headless. `-p` runs the same agent loop without a terminal UI,
 * `--output-format json` returns one envelope carrying the result, the
 * session and the cost.
 */
const CLAUDE: ProviderSpec = {
  command: "claude",
  assignsSessionId: true,

  startArgs(prompt, sessionId) {
    return [
      "-p",
      prompt,
      "--output-format",
      "json",
      // Ours, not theirs: see the note at the top of this file.
      "--session-id",
      sessionId,
    ];
  },

  resumeArgs(prompt, sessionId) {
    return ["-p", prompt, "--output-format", "json", "--resume", sessionId];
  },

  parse(stdout) {
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(stdout.trim()) as Record<string, unknown>;
    } catch {
      return failed(
        "the CLI did not answer with a JSON envelope — its output cannot be read as a result",
      );
    }
    if (typeof envelope.result !== "string") {
      return failed("the envelope carries no result field");
    }
    return {
      isFailure: false,
      value: {
        finalText: envelope.result,
        sessionId: typeof envelope.session_id === "string" ? envelope.session_id : null,
        tokenUsage: usageOf(envelope.usage),
        cost:
          typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : null,
      },
    };
  },
};

/**
 * Codex, non-interactive. `exec --json` streams JSONL events rather than
 * returning a document, and resuming is a SUBCOMMAND with different arguments
 * — the exact case OpenClaw's config models as `resumeArgs`.
 *
 * It cannot be told its session id; it announces one in `thread.started`. The
 * two providers genuinely differ here, and flattening that difference is how
 * a shared abstraction starts lying about what it can do.
 */
const CODEX: ProviderSpec = {
  command: "codex",
  assignsSessionId: false,

  startArgs(prompt) {
    return ["exec", "--json", prompt];
  },

  resumeArgs(prompt, sessionId) {
    return ["exec", "resume", sessionId, "--json", prompt];
  },

  parse(stdout) {
    let sessionId: string | null = null;
    let finalText: string | null = null;
    let tokenUsage: Record<string, number> | null = null;

    for (const line of stdout.split("\n")) {
      if (line.trim() === "") {
        continue;
      }
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // A stream is not a document: one unreadable line is noise, not a
        // failure. Refusing the whole run over it would throw away a result
        // that arrived perfectly well.
        continue;
      }
      if (typeof event.thread_id === "string") {
        sessionId = event.thread_id;
      }
      if (typeof event.text === "string") {
        // The LAST message wins: the stream is chronological.
        finalText = event.text;
      }
      const usage = usageOf(event.usage);
      if (usage) {
        tokenUsage = usage;
      }
    }

    if (finalText === null) {
      return failed("the event stream carried no message — nothing was said");
    }
    return {
      isFailure: false,
      value: { finalText, sessionId, tokenUsage, cost: null },
    };
  },
};

const SPECS: Record<string, ProviderSpec> = { claude: CLAUDE, codex: CODEX };

/** §4.14 — the providers this worker knows how to drive, in a fixed order. */
export const PROVIDERS = Object.keys(SPECS);

/**
 * Null for anything else, and the caller refuses rather than improvising. A
 * provider this worker cannot drive is a configuration problem to report, not
 * a command line to guess at.
 */
export function providerSpec(provider: string): ProviderSpec | null {
  return SPECS[provider] ?? null;
}
