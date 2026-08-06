import {
  Activity as ActivityIcon,
  BookMarked,
  Bot,
  Cpu,
  Layers,
  SlidersHorizontal,
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
  activity: "/activity",
  memory: "/memory",
  inbox: "/inbox",
  threads: "/threads",
  thread: (threadId: string) => `/threads/${threadId}`,
  workspace: "/workspace",

  /**
   * Above the workspace, not inside it.
   *
   * §6.3 and §18.2 — a machine is paired to an ORGANIZATION and then lent to
   * workspaces; an agent's identity is issued by the organization and its
   * powers are granted per workspace. Two levels, genuinely: mixing them on
   * one screen made "your machines" mean two different sets depending on
   * where the reader was standing.
   */
  organization: "/organization",
  fleet: "/organization/machines",
  agents: "/organization/agents",
  organizationActivity: "/organization/activity",
  organizationWorkspaces: "/organization/workspaces",
  /** Account-wide, not workspace-scoped: reached from the account menu. */
  settings: "/settings",
} as const;

/**
 * What the organization contributes to the WORKSPACE rail, when somebody asks
 * for it there.
 *
 * Not the whole list: the workspace switcher already stands for Workspaces
 * and the account menu already stands for Settings. Repeating them would put
 * three ways to the same place in one column, which reads as three places.
 */
export function organizationRailItems(): NavItem[] {
  return ORGANIZATION_NAV.filter(
    (item) => item.href !== routes.organizationWorkspaces && item.href !== routes.settings,
  );
}

/** True for the screens that live above any workspace. */
export function isOrganizationLevel(pathname: string): boolean {
  return pathname.startsWith(routes.organization) || pathname.startsWith(routes.settings);
}

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
      // Machines are NOT here: they belong to the organization and are lent
      // to workspaces, so one screen above serves every workspace rather than
      // one copy per workspace pretending each owns its own fleet.
      {
        href: routes.memory,
        label: "Memory",
        icon: BookMarked,
        hint: "what this workspace has settled",
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

/**
 * The organization's own rail. Never changes when a workspace is switched,
 * because none of it belongs to a workspace.
 */
export const ORGANIZATION_NAV: NavItem[] = [
  {
    href: routes.fleet,
    label: "Machines",
    icon: Cpu,
    hint: "every computer you own, and what it serves",
    badge: "machines",
  },
  {
    href: routes.agents,
    label: "Agents",
    icon: Bot,
    hint: "the identities you have issued",
  },
  {
    href: routes.organizationActivity,
    label: "Activity",
    icon: ActivityIcon,
    hint: "pairings, identities — what the organization itself did",
  },
  {
    href: routes.organizationWorkspaces,
    label: "Workspaces",
    icon: Layers,
    hint: "everything below the organization",
  },
  {
    href: routes.settings,
    label: "Settings",
    icon: SlidersHorizontal,
    hint: "your account and your organization",
  },
];

const ALL = [...NAV.flatMap((group) => group.items), ...ORGANIZATION_NAV];

/**
 * Pages that are reachable but not in the rail. Without them the top bar
 * falls back to the product's name, which tells a reader nothing about where
 * they are.
 */
const ASIDE: { href: string; label: string }[] = [
  { href: routes.organization, label: "Organization" },
];

/** The heading shown in the top bar. Longest match wins, so `/runs/abc` is a run. */
export function titleFor(pathname: string): string {
  const match = [...ALL, ...ASIDE]
    .filter((item) => pathname.startsWith(item.href))
    .sort((left, right) => right.href.length - left.href.length)[0];
  return match?.label ?? "Spline";
}

/** Whether a nav entry is the one being looked at, drill-downs included. */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
