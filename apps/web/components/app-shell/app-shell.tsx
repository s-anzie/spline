"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appNavigation, workspaceNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { CreateDialog } from "./create-dialog";
import { RouteProgress } from "./route-progress";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { RealtimeBridge } from "./realtime-bridge";
import { CommandSearch } from "./command-search";
import { AccountMenu } from "./account-menu";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useNotificationStore } from "@/stores/notification-store";

function activeWorkspaceId(pathname: string) {
  const id = pathname.match(/^\/workspaces\/([^/]+)/)?.[1];
  return id === "new" ? undefined : id;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const workspaceId = activeWorkspaceId(pathname);
  const navigation = workspaceId
    ? workspaceNavigation(workspaceId)
    : appNavigation;
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const resetWorkspaces = useWorkspaceStore((state) => state.reset);
  const resetPlanning = usePlanningStore((state) => state.reset);
  const resetDomains = useWorkspaceDomainStore((state) => state.reset);
  const questions = useWorkspaceDomainStore((state) => state.questions);
  const notifications = useWorkspaceDomainStore((state) => state.notifications);
  const runtimeHealth = useWorkspaceDomainStore((state) => state.runtimeHealth);
  const sessions = useWorkspaceDomainStore((state) => state.sessions);
  const tasks = usePlanningStore((state) => state.tasks);
  const goals = usePlanningStore((state) => state.goals);
  const unreadNotifications = useNotificationStore((state) => state.items);
  const loadNotifications = useNotificationStore((state) => state.load);
  const interventionCount =
    questions.filter((item) => item.status === "OPEN").length +
    notifications.filter(
      (item) =>
        item.payload["collaborationType"] === "MANAGER_HUMAN_QUESTION" &&
        typeof item.payload["humanAnswer"] !== "string",
    ).length +
    tasks.filter((item) => item.status === "BLOCKED").length +
    [...tasks, ...goals].filter((item) => item.validationState === "PENDING")
      .length +
    (runtimeHealth
      ? runtimeHealth.machines.stale +
        runtimeHealth.sessions.stale +
        runtimeHealth.commands.stuck
      : 0);
  const activeAgentCount = new Set(
    sessions
      .filter((item) =>
        ["STARTING", "RUNNING", "AWAITING_APPROVAL"].includes(item.status),
      )
      .map((item) => item.agentId),
  ).size;
  const initials =
    user?.displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  useEffect(() => {
    document.body.classList.add("app-shell-active");
    void loadNotifications();
    return () => document.body.classList.remove("app-shell-active");
  }, [loadNotifications]);

  function handleLogout() {
    resetWorkspaces();
    resetPlanning();
    resetDomains();
    logout();
  }

  return (
    <div className="dark h-dvh overflow-hidden bg-[#11100f] text-[#f2efea] [background-image:radial-gradient(circle_at_55%_-20%,rgba(244,123,100,.06),transparent_31%)]">
      <RouteProgress />
      <RealtimeBridge workspaceId={workspaceId} />
      <div
        aria-hidden
        className="pointer-events-none fixed left-[30%] top-[-16rem] size-[34rem] rounded-full bg-[#f47b64]/[.035] blur-[100px] motion-safe:animate-[ambient-drift_12s_ease-in-out_infinite]"
      />
      <aside className="fixed inset-y-0 left-0 z-20 flex w-17 flex-col border-r border-white/[.075] bg-[#11100f]/95 px-2.5 py-5 backdrop-blur-xl md:w-61 md:px-4">
        <Link
          href="/dashboard"
          className="group flex h-10 items-center gap-2.5 px-2.5 text-xl font-semibold tracking-tight"
        >
          <span className="text-[#f47b64] transition-[filter,transform] duration-300 group-hover:rotate-12 group-hover:scale-110 group-hover:drop-shadow-[0_0_9px_rgba(244,123,100,.65)]">
            ◉
          </span>
          <span className="hidden md:block">spline</span>
        </Link>
        <WorkspaceSwitcher workspaceId={workspaceId} />
        <nav className="app-scrollbar mt-4 grid min-h-0 gap-1 overflow-y-auto pb-3">
          {navigation.map(({ label, href, icon: Icon }, index) => {
            const section = navigation[index]?.section;
            const previousSection = navigation[index - 1]?.section;
            const exact = workspaceId
              ? href === `/workspaces/${workspaceId}`
              : href === "/dashboard";
            const active = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            const isInterventions = workspaceId && href.endsWith("/attention");
            const isCollaboration = workspaceId && href.endsWith("/execution");
            const isGlobalAttention = !workspaceId && href === "/attention";
            const signal = isInterventions
              ? interventionCount
              : isCollaboration
                ? activeAgentCount
                : isGlobalAttention
                  ? unreadNotifications.length
                  : 0;
            return (
              <div key={href}>
                {section !== previousSection && (
                  <p className="mb-1 mt-3 hidden px-3 text-[8px] font-semibold uppercase tracking-[.16em] text-[#514e4a] first:mt-0 md:block">
                    {section}
                  </p>
                )}
              <Button
                style={{ animationDelay: `${index * 35}ms` }}
                title={label}
                nativeButton={false}
                render={<Link href={href} />}
                variant="ghost"
                className={cn(
                  "relative h-10 w-full animate-nav-in justify-center px-0 text-[#85817d] hover:bg-white/[.035] hover:text-[#e6e1dc] md:justify-start md:px-3",
                  active &&
                    "bg-[#f47b64]/10 text-[#f5ede7] shadow-[inset_2px_0_#f47b64] hover:bg-[#f47b64]/10",
                )}
              >
                <Icon
                  className={cn("size-[18px]", active && "text-[#f47b64]")}
                />
                <span className="hidden flex-1 text-left text-xs md:block">
                  {label}
                </span>
                {signal > 0 && (
                  <span
                    className={cn(
                      "absolute right-0.5 top-0.5 min-w-4 rounded-full px-1 py-0.5 text-center text-[7px] font-semibold md:static md:min-w-5 md:text-[8px]",
                      isInterventions || isGlobalAttention
                        ? "bg-[#f47b64]/15 text-[#f47b64]"
                        : "bg-emerald-400/10 text-emerald-300",
                    )}
                  >
                    {signal > 99 ? "99+" : signal}
                  </span>
                )}
              </Button>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className="mb-1 h-px bg-white/[.075]" />
          <AccountMenu
            user={user}
            initials={initials}
            onLogout={handleLogout}
          />
        </div>
      </aside>
      <main className="relative ml-17 grid h-dvh min-h-0 grid-rows-[3.5rem_minmax(0,1fr)] overflow-hidden md:ml-61">
        <header className="z-10 flex h-14 items-center justify-end gap-3 border-b border-white/[.075] bg-[#11100f]/85 px-4 backdrop-blur-xl transition-shadow duration-300 sm:px-8 lg:px-10">
          <CommandSearch workspaceId={workspaceId} />
          <Button
            nativeButton={false}
            render={<Link href={workspaceId ? `/workspaces/${workspaceId}/attention` : "/attention"} />}
            size="icon-lg"
            variant="outline"
            className="relative hidden border-white/[.075] bg-white/[.025] text-muted-foreground sm:inline-flex"
          >
            <Bell />
            {(workspaceId ? interventionCount : unreadNotifications.length) > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[#f47b64] px-1 py-0.5 text-[7px] font-bold text-[#241614] shadow-[0_0_0_3px_#11100f]">
                {(workspaceId ? interventionCount : unreadNotifications.length) > 99
                  ? "99+"
                  : workspaceId
                    ? interventionCount
                    : unreadNotifications.length}
              </span>
            )}
          </Button>
          <CreateDialog />
        </header>
        <div
          key={pathname}
          className="app-scrollbar min-h-0 w-full overflow-y-auto overscroll-contain"
        >
          <div className="animate-page-in mx-auto w-full max-w-[1370px] px-4 py-5 sm:px-8 sm:py-6 lg:px-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
