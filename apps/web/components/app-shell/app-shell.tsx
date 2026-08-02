"use client";

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
  const initials =
    user?.displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  function handleLogout() {
    resetWorkspaces();
    resetPlanning();
    resetDomains();
    logout();
  }

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-[#11100f] text-[#f2efea] [background-image:radial-gradient(circle_at_55%_-20%,rgba(244,123,100,.06),transparent_31%)]">
      <RouteProgress />
      <RealtimeBridge />
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
        <p className="mt-5 hidden px-3 text-[8px] font-semibold uppercase tracking-[.16em] text-[#514e4a] md:block">
          {workspaceId ? "Workspace" : "Global"}
        </p>
        <nav className="mt-2 grid gap-1">
          {navigation.map(({ label, href, icon: Icon }, index) => {
            const exact = href.split("/").length <= 3;
            const active = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Button
                style={{ animationDelay: `${index * 35}ms` }}
                key={href}
                nativeButton={false}
                render={<Link href={href} />}
                variant="ghost"
                className={cn(
                  "animate-nav-in h-10 justify-center px-0 text-[#85817d] hover:bg-white/[.035] hover:text-[#e6e1dc] md:justify-start md:px-3",
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
              </Button>
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
      <main className="relative ml-17 min-h-screen md:ml-61">
        <header className="sticky top-0 z-10 flex h-18 items-center justify-end gap-3 border-b border-white/[.075] bg-[#11100f]/85 px-4 backdrop-blur-xl transition-shadow duration-300 sm:px-8 lg:px-10">
          <CommandSearch workspaceId={workspaceId} />
          <Button
            nativeButton={false}
            render={<Link href="/attention" />}
            size="icon-lg"
            variant="outline"
            className="relative hidden border-white/[.075] bg-white/[.025] text-muted-foreground sm:inline-flex"
          >
            <Bell />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#f47b64] shadow-[0_0_0_0_rgba(244,123,100,.45)] motion-safe:animate-[notification-pulse_2.2s_ease-out_infinite]" />
          </Button>
          <CreateDialog />
        </header>
        <div
          key={pathname}
          className="animate-page-in mx-auto max-w-[1370px] p-4 py-8 sm:p-8 lg:p-10"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
