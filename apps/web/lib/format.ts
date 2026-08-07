/**
 * How measurements are written down.
 *
 * All of these read left to right in a column, which is the only reason they
 * exist as functions rather than inline template strings: `2m 14s` and
 * `14s` must occupy the same visual slot, and `$0.0412` must line its decimal
 * point up with `$1.2000`.
 */

/** "4m ago", "3d ago" — never a raw timestamp in a list. */
export function since(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 0) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 45) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

/** The full stamp, for a detail screen where the exact moment matters. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Four decimals, always. An agent's attempt costs cents, and a column where
 * "$0.04" sits above "$0.0412" cannot be added up by eye.
 */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(4)}`;
}

export function tokens(usage: Record<string, number> | null | undefined): string {
  if (!usage) return "—";
  const total = Object.values(usage).reduce((sum, n) => sum + n, 0);
  if (total === 0) return "—";
  if (total < 1000) return String(total);
  return `${(total / 1000).toFixed(1)}k`;
}

/**
 * The first segment of a uuid. Enough to recognise a row and to say out loud;
 * the full value is always one copy away on the detail screen.
 */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

/** A name the domain uses — `SCREAMING_SNAKE` or `PascalCase` — read by a person. */
export function humanise(word: string | null | undefined): string {
  if (!word) return "—";
  return (
    word
      /**
       * Two shapes arrive here and only one used to be handled.
       *
       * `SCREAMING_SNAKE` (a status) split on its underscores; `PascalCase`
       * (a command type) did not, so `ExecuteTask` reached the screen as
       * "executetask" — one mashed word in the middle of a queue somebody
       * reads to know what their machines are doing.
       *
       * The lookahead keeps runs of capitals together, so `HTTPRequest`
       * becomes "http request" rather than "h t t p request".
       */
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .toLowerCase()
      .replace(/_/g, " ")
  );
}
