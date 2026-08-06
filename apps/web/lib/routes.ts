import {
  Activity as ActivityIcon,
  Cpu,
  Inbox as InboxIcon,
  ListChecks,
  MessagesSquare,
  Play,
  Settings2,
  Target,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/**
 * Every address in the console, in one place.
 *
 * Paths are built here rather than interpolated at each call site so that a
 * rename is one edit and a typo is a compile error. The sidebar, the command
 * palette and every row that opens something all read from this.
 */
export const routes = {
  queue: "/queue",
  goals: "/goals",
  goal: (goalId: string) => `/goals/${goalId}`,
  tasks: "/tasks",
  task: (taskId: string) => `/tasks/${taskId}`,
  runs: "/runs",
  run: (runId: string) => `/runs/${runId}`,
  machines: "/machines",
  activity: "/activity",
  inbox: "/inbox",
  threads: "/threads",
  thread: (threadId: string) => `/threads/${threadId}`,
  workspace: "/workspace",
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One line, for the palette. Says what the screen is FOR, not what it is. */
  hint: string;
  badge?: "needsYou" | "unread" | "machines" | "awaiting";
}

/**
 * The rail, grouped the way an operator's attention is rather than the way
 * the data model is: what is on me, what the work is, what runs it.
 *
 * Eight equal entries in one flat list read as eight equal things, and they
 * are not — the queue is checked twenty times a day, governance twice a year.
 */
export const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "On you",
    items: [
      {
        href: routes.queue,
        label: "Queue",
        icon: TriangleAlert,
        hint: "what needs a person",
        badge: "needsYou",
      },
      {
        href: routes.inbox,
        label: "Inbox",
        icon: InboxIcon,
        hint: "addressed to you by name",
        badge: "unread",
      },
      {
        href: routes.threads,
        label: "Conversations",
        icon: MessagesSquare,
        hint: "ask somebody, and be told what came of it",
        badge: "awaiting",
      },
    ],
  },
  {
    heading: "The work",
    items: [
      { href: routes.goals, label: "Goals", icon: Target, hint: "what this is all for" },
      { href: routes.tasks, label: "Tasks", icon: ListChecks, hint: "the unit of work" },
      { href: routes.runs, label: "Runs", icon: Play, hint: "what executed, and what it cost" },
    ],
  },
  {
    heading: "What runs it",
    items: [
      {
        href: routes.machines,
        label: "Machines",
        icon: Cpu,
        hint: "the computers that run agents",
        badge: "machines",
      },
      {
        href: routes.activity,
        label: "Activity",
        icon: ActivityIcon,
        hint: "the journal, in hub order",
      },
      {
        href: routes.workspace,
        label: "Workspace",
        icon: Settings2,
        hint: "health, people, locks, rules",
      },
    ],
  },
];

const ALL = NAV.flatMap((group) => group.items);

/** The heading shown in the top bar. Longest match wins, so `/runs/abc` is a run. */
export function titleFor(pathname: string): string {
  const match = ALL.filter((item) => pathname.startsWith(item.href)).sort(
    (left, right) => right.href.length - left.href.length,
  )[0];
  return match?.label ?? "Spline";
}

/** Whether a nav entry is the one being looked at, drill-downs included. */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
