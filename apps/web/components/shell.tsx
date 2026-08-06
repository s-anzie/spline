"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { since } from "@/lib/format";
import { usePulse } from "@/lib/pulse";
import { isCurrent, NAV, routes, titleFor, type NavItem } from "@/lib/routes";
import { useOrganizationId, useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { TONE_TEXT } from "@/components/kit";
import { CommandMenu } from "@/components/command-menu";
import { NewWorkspace } from "@/components/forms";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Shell({ children }: { children: React.ReactNode }) {
  const { email, workspaceId, workspaces, chooseWorkspace, logOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const organizationId = useOrganizationId();
  const pulse = usePulse(workspaceId, organizationId);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = workspaces.find((workspace) => workspace.id === workspaceId);

  const badgeFor = (badge: NavItem["badge"]): string | null => {
    if (badge === "needsYou") return pulse.needsYou ? String(pulse.needsYou) : null;
    if (badge === "unread") return pulse.unread ? String(pulse.unread) : null;
    if (badge === "awaiting") return pulse.awaiting ? String(pulse.awaiting) : null;
    if (badge === "machines" && pulse.machinesTotal !== null) {
      return `${pulse.machinesReporting}/${pulse.machinesTotal}`;
    }
    return null;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="bg-sidebar border-sidebar-border sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r">
        <Link href={routes.queue} className="flex h-14 items-center gap-2 px-4">
          <Spool />
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            Spline
          </span>
        </Link>

        {current ? (
          <div className="px-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors"
                >
                  <Initials name={current.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {current.name}
                    </span>
                    <span className="text-muted-foreground block text-[0.6875rem]">
                      workspace
                    </span>
                  </span>
                  <ChevronsUpDown className="text-muted-foreground size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="label">
                  Workspaces
                </DropdownMenuLabel>
                {workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onSelect={() => {
                      chooseWorkspace(workspace.id);
                      router.push(routes.queue);
                    }}
                    className="gap-2"
                  >
                    <Initials name={workspace.name} small />
                    <span className="flex-1 truncate">{workspace.name}</span>
                    {workspace.id === workspaceId ? (
                      <Check className="size-3.5" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <NewWorkspace
                  trigger={
                    <button
                      type="button"
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                    >
                      <Plus className="size-3.5" />
                      New workspace
                    </button>
                  }
                />
                {/* §4.2 — there is no "all workspaces". Saying so is kinder
                    than letting somebody hunt for the option. */}
                <p className="text-muted-foreground px-2 py-1.5 text-xs leading-relaxed">
                  Nothing is ever read across two workspaces.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        <div className="px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="text-muted-foreground hover:bg-sidebar-accent border-sidebar-border flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Go to…</span>
            <kbd className="measure bg-muted rounded px-1 py-0.5 text-[0.625rem]">
              ⌘K
            </kbd>
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 py-3">
            {NAV.map((group) => (
              <div key={group.heading} className="mb-5">
                <p className="label mb-1.5 px-2">{group.heading}</p>
                <ul className="flex flex-col gap-px">
                  {group.items.map((item) => {
                    const active = isCurrent(pathname, item.href);
                    const badge = badgeFor(item.badge);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "size-4 shrink-0",
                              active ? "text-signal" : "opacity-70",
                            )}
                            strokeWidth={1.75}
                          />
                          <span className="flex-1 text-left">{item.label}</span>
                          {badge ? (
                            <span
                              className={cn(
                                "measure rounded px-1.5 py-0.5 text-[0.625rem] leading-none",
                                item.badge === "needsYou"
                                  ? "bg-signal text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {badge}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-sidebar-border border-t p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors"
              >
                <Initials name={email ?? "?"} />
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  {email}
                </span>
                <ChevronsUpDown className="text-muted-foreground size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <ThemeItems />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logOut} className="gap-2">
                <LogOut className="size-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background border-border flex h-14 shrink-0 items-center gap-4 border-b px-7">
          <span className="text-sm font-medium">{titleFor(pathname)}</span>
          {detailOf(pathname) ? (
            <span className="measure text-muted-foreground text-xs">
              / {detailOf(pathname)}
            </span>
          ) : null}

          {workspaceId ? (
            <div className="ml-auto flex items-center gap-2">
              <HealthChip pulse={pulse} onOpen={() => router.push(routes.workspace)} />
              <ThemeToggle />
            </div>
          ) : null}
        </header>

        {/* The one scroller on the page. `min-h-0` is what lets it shrink
            inside the flex column instead of pushing the frame off-screen. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main
            key={pathname}
            className="settling mx-auto w-full max-w-6xl px-7 py-8"
          >
            {children}
          </main>
        </div>
      </div>

      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

/**
 * The health of the workspace, always in the same corner.
 *
 * It reports the hub's own assessment (§17) rather than a number this console
 * invented by counting rows, and it names the worst signal — because a level
 * without a reason cannot be acted on.
 */
function HealthChip({
  pulse,
  onOpen,
}: {
  pulse: ReturnType<typeof usePulse>;
  onOpen: () => void;
}) {
  const tone = toneOf(pulse.health);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-accent flex max-w-md items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors"
      title={pulse.assessedAt ? `assessed ${since(pulse.assessedAt)}` : undefined}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "signal" && "bg-signal breathing",
          tone === "waiting" && "bg-waiting",
          tone === "settled" && "bg-settled",
          tone === "live" && "bg-live",
          tone === "quiet" && "bg-muted-foreground/50",
        )}
      />
      <span className={cn("shrink-0 font-medium", TONE_TEXT[tone])}>
        {pulse.health ? pulse.health.toLowerCase() : "assessing…"}
      </span>
      {pulse.worstReason ? (
        <span className="text-muted-foreground truncate">— {pulse.worstReason}</span>
      ) : null}
    </button>
  );
}

/** One click, for the person who just wants it darker now. */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // The server cannot know the viewer's theme, so the icon is only decided
  // once the client has resolved it — otherwise it flips on hydration.
  useEffect(() => setMounted(true), []);
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={dark ? "Switch to light" : "Switch to dark"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {mounted && !dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}

function ThemeItems() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <>
      <DropdownMenuLabel className="label">Appearance</DropdownMenuLabel>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.value}
          onSelect={() => setTheme(option.value)}
          className="gap-2"
        >
          <option.icon className="size-3.5" />
          <span className="flex-1">{option.label}</span>
          {theme === option.value ? <Check className="size-3.5" /> : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function Initials({ name, small = false }: { name: string; small?: boolean }) {
  const letters = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground measure flex shrink-0 items-center justify-center rounded font-medium",
        small ? "size-5 text-[0.5625rem]" : "size-7 text-[0.625rem]",
      )}
    >
      {letters || "?"}
    </span>
  );
}

/**
 * The mark: a spline — a curve drawn through fixed points. Three points, one
 * of them ember, because the whole product is about the one that needs you.
 */
function Spool() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <path
        d="M2.5 15.5C6 15.5 6 4.5 10 4.5s4 11 7.5 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="2.5" cy="15.5" r="1.6" fill="currentColor" opacity="0.45" />
      <circle cx="17.5" cy="15.5" r="1.6" fill="currentColor" opacity="0.45" />
      <circle cx="10" cy="4.5" r="2.1" fill="var(--signal)" />
    </svg>
  );
}

/** The id in a drill-down URL, shortened for the breadcrumb. */
function detailOf(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length > 1 ? (segments[1]?.slice(0, 8) ?? null) : null;
}
