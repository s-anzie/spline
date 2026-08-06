/**
 * §17 — what an agent was doing while it was doing it.
 *
 * Until now a run was a black box that reported a number at the end: how much
 * it cost, how long it took, and one final sentence. An operator asking "is it
 * working, and on what?" had nothing to read — which is the same position as
 * having no agent at all, minus the money.
 *
 * `claude -p --output-format stream-json` emits one JSON object per line as it
 * goes. This turns those lines into a short, readable trace: what the agent
 * said, and which tools it reached for. Deliberately NOT the raw stream —
 * token-by-token deltas are noise nobody reads, and storing them would put
 * megabytes of them in the journal.
 */

export interface TraceEntry {
  /** What kind of thing happened, in this system's words rather than a CLI's. */
  kind: "said" | "used" | "result";
  /** One line. Long content is cut here rather than in the database. */
  text: string;
  at: string;
}

/** One line is plenty to know what is happening; more is a log nobody reads. */
const MAX_TEXT = 240;
/** A run that emitted ten thousand steps is a run whose trace nobody will read. */
const MAX_ENTRIES = 200;

function trim(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= MAX_TEXT ? flat : `${flat.slice(0, MAX_TEXT - 1)}…`;
}

/**
 * Reads NDJSON as it arrives, keeping whatever is not yet a whole line.
 *
 * A chunk from a pipe is not a line: it can end mid-object, and `JSON.parse`
 * on half an object throws. Buffering the remainder is the entire reason this
 * is a class rather than a function.
 */
export class TraceReader {
  private buffer = "";
  private readonly entries: TraceEntry[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Feed it whatever came out of the pipe. Returns what is newly known. */
  read(chunk: string): TraceEntry[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    // The last piece may be incomplete; it waits for the rest.
    this.buffer = lines.pop() ?? "";

    const fresh: TraceEntry[] = [];
    for (const line of lines) {
      const entry = this.entryOf(line);
      if (entry && this.entries.length < MAX_ENTRIES) {
        this.entries.push(entry);
        fresh.push(entry);
      }
    }
    return fresh;
  }

  /** Everything understood so far, oldest first. */
  get trace(): readonly TraceEntry[] {
    return this.entries;
  }

  private entryOf(line: string): TraceEntry | null {
    const raw = line.trim();
    if (raw === "" || !raw.startsWith("{")) {
      return null;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // A line that is not JSON is a line this does not understand. Silence
      // rather than noise: the raw output is still reported at the end.
      return null;
    }

    const at = this.now().toISOString();
    const message = event.message as { content?: unknown } | undefined;
    const content = Array.isArray(message?.content) ? message.content : [];

    for (const part of content as Record<string, unknown>[]) {
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        return { kind: "said", text: trim(part.text), at };
      }
      if (part.type === "tool_use" && typeof part.name === "string") {
        /**
         * The tool's NAME and a hint of its input, never the whole input. A
         * file write's input is the file — putting it in a trace would mean
         * storing the agent's output twice, once where nobody expects it.
         */
        const input = part.input as Record<string, unknown> | undefined;
        const hint =
          typeof input?.file_path === "string"
            ? input.file_path
            : typeof input?.command === "string"
              ? input.command
              : typeof input?.pattern === "string"
                ? input.pattern
                : "";
        return {
          kind: "used",
          text: hint ? `${part.name} — ${trim(hint)}` : part.name,
          at,
        };
      }
    }

    // The closing envelope: what it finally said, and that it is over.
    if (event.type === "result" && typeof event.result === "string") {
      return { kind: "result", text: trim(event.result), at };
    }
    return null;
  }
}

/**
 * The last `result` envelope in an NDJSON stream.
 *
 * `--output-format json` printed one object and `JSON.parse(stdout)` worked.
 * `stream-json` prints many, so parsing the whole thing throws — the envelope
 * has to be picked out. Searched from the end because that is where it is, and
 * because an agent that printed the word "result" earlier is not the result.
 */
export function lastEnvelope(stdout: string): string | null {
  const lines = stdout.split("\n");
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const line = (lines[at] ?? "").trim();
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.type === "result") {
        return line;
      }
    } catch {
      continue;
    }
  }
  return null;
}
