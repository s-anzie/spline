/**
 * §17 — what an agent did between two things it said, in a person's words.
 *
 * The first version of this printed one full-width row per trace entry, with
 * the same weight as a turn. A single ordinary run produced fourteen of them
 * — `mcp__spline__release_lock`, `ToolSearch`, `Write —
 * /tmp/claude-1000/-home-bradley-…/hello.txt` — and what anybody had actually
 * SAID was buried in the middle of them. A conversation had become a log with
 * two sentences hidden in it.
 *
 * The trace is not the conversation. It is evidence that the silence is work
 * rather than a hang, which is a real need and a quiet one. So the run's steps
 * collapse into one line between turns, opened only by somebody who wants
 * them — and when they are open they are readable, because a tool call
 * written the way a CLI names it is not information to anyone but its author.
 */

/** Internal machinery nobody outside this process needs to see happen. */
const SILENT = new Set(["ToolSearch", "TodoWrite"]);

/**
 * A tool call, in the words somebody would use to describe it.
 *
 * `mcp__spline__release_lock` is an address, not a sentence. The mapping is
 * explicit rather than derived from the name because these are the verbs of
 * §10's protocol and they deserve to read like verbs — and because a rule
 * that turns underscores into spaces would still leave `mcp spline release
 * lock` on the screen.
 */
const SAYS: Record<string, string> = {
  mcp__spline__synchronize: "read the task",
  mcp__spline__read_workspace: "read the workspace",
  mcp__spline__publish_progress: "published progress",
  mcp__spline__record_decision: "recorded a decision",
  mcp__spline__report_blocker: "reported a blocker",
  mcp__spline__acquire_lock: "took a lock",
  mcp__spline__release_lock: "released the lock",
  mcp__spline__request_validation: "asked for validation",
  mcp__spline__state_goal: "stated a goal",
  mcp__spline__cut_task: "cut a task",
  mcp__spline__hand_over: "handed work over",
  mcp__spline__list_team: "looked up the team",
  mcp__spline__list_goals: "read the goals",
};

/**
 * The readable half of a trace line.
 *
 * A trace entry is `name — argument`, and the argument is usually a path or a
 * command line. Both are printed in full by the CLI, and in full they are the
 * width of the screen: the run above showed the same 84-character temporary
 * directory four times. The file's name is the part that means something; the
 * directory it lives in is the same for every step of the run.
 */
export function readable(text: string): string | null {
  const [head = "", ...rest] = text.split(" — ");
  const name = head.trim();
  if (SILENT.has(name)) {
    return null;
  }
  const argument = rest.join(" — ").trim();

  const said = SAYS[name];
  if (said) {
    return said;
  }
  if (name === "Write" || name === "Edit" || name === "NotebookEdit") {
    const file = argument.split("/").pop() ?? argument;
    return `${name === "Write" ? "wrote" : "edited"} ${file || "a file"}`;
  }
  if (name === "Read") {
    const file = argument.split("/").pop() ?? argument;
    return `read ${file || "a file"}`;
  }
  if (name === "Bash") {
    /**
     * The first meaningful word of the command, not the command. An agent's
     * heredoc commit message runs to several lines, and none of them tell a
     * reader more than "ran git commit" does.
     */
    const words = argument.split(/\s+/).filter(Boolean);
    const verb = words.slice(0, 2).join(" ");
    return verb ? `ran ${verb}` : "ran a command";
  }
  if (name === "Glob" || name === "Grep") {
    return "searched the project";
  }
  return argument ? `${name}: ${argument}` : name;
}
