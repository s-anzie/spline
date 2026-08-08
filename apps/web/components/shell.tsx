"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { since } from "@/lib/format";
import { usePulse } from "@/lib/pulse";
import {
  isCurrent,
  isOrganizationLevel,
  NAV,
  ORGANIZATION_NAV,
  organizationRailItems,
  routes,
  titleFor,
  type NavItem,
} from "@/lib/routes";
import { useOrganization, useOrganizationId, usePreferences, useSession } from "@/lib/store";
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
  const { email, displayName, workspaceId, workspaces, chooseWorkspace, logOut } =
    useSession();
  const organization = useOrganization();
  const inRail = usePreferences((state) => state.organizationInRail);
  const pathname = usePathname();
  const router = useRouter();
  // Above a workspace, the rail is the organization's. Showing a workspace's
  // queue beside the fleet would put two scopes in one column and leave the
  // reader to work out which one each row belongs to.
  const aboveWorkspace = isOrganizationLevel(pathname);
  const organizationId = useOrganizationId();
  const pulse = usePulse(workspaceId, organizationId);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

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

  // A route change is also a navigation acknowledgement on a small screen.
  // Closing here keeps the rail from covering the destination it just opened.
  useEffect(() => setRailOpen(false), [pathname]);

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
      {railOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] md:hidden"
          onClick={() => setRailOpen(false)}
        />
      ) : null}
      <nav
        aria-label="Main navigation"
        className={cn(
          "bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r shadow-2xl transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:shadow-none",
          railOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href={routes.queue} className="flex h-14 items-center gap-2 px-4">
          <Spool />
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            Spline
          </span>
        </Link>

        {current && !aboveWorkspace ? (
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
              <DropdownMenuContent align="start" className="w-60">
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
            {aboveWorkspace ? (
              <>
                <Link
                  href={workspaceId ? routes.queue : routes.organization}
                  className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1.5 px-2 text-xs transition-colors"
                >
                  <ChevronLeft className="size-3.5" />
                  {current ? `Back to ${current.name}` : "Back"}
                </Link>
                <p className="label mb-1.5 px-2">
                  {organization?.name ?? "Organization"}
                </p>
                <ul className="mb-5 flex flex-col gap-px">
                  {ORGANIZATION_NAV.map((item) => (
                    <li key={item.href}>
                      <RailLink
                        item={item}
                        active={isCurrent(pathname, item.href)}
                        badge={badgeFor(item.badge)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {!aboveWorkspace && inRail ? (
              <div className="mb-5">
                <p className="label mb-1.5 px-2">
                  {organization?.name ?? "Organization"}
                </p>
                <ul className="flex flex-col gap-px">
                  {organizationRailItems().map((item) => (
                    <li key={item.href}>
                      <RailLink item={item} active={false} badge={badgeFor(item.badge)} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {aboveWorkspace ? null : NAV.map((group) => (
              <div key={group.heading} className="mb-5">
                <p className="label mb-1.5 px-2">{group.heading}</p>
                <ul className="flex flex-col gap-px">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <RailLink
                        item={item}
                        active={isCurrent(pathname, item.href)}
                        badge={badgeFor(item.badge)}
                      />
                    </li>
                  ))}
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
                <Initials name={displayName ?? email ?? "?"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {displayName ?? email}
                  </span>
                  {displayName ? (
                    <span className="text-muted-foreground block truncate text-xs">
                      {email}
                    </span>
                  ) : null}
                </span>
                <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            {/* The trigger already carries the name and the email; repeating
                them at the top of the menu it opened is furniture. */}
            <DropdownMenuContent align="start" side="top" className="w-64 p-1.5">
              {/**
               * §18 — the organization owns the machines, the agents and every
               * workspace. Created silently at sign-up, it appeared nowhere,
               * which made "your machines" a phrase with no referent. It
               * belongs beside the account rather than beside a workspace: it
               * is not something you switch between.
               */}
              <OrganizationLine />

              <DropdownMenuSeparator className="mx-0 my-1.5" />
              <ThemeChoice />

              <DropdownMenuSeparator className="mx-0 my-1.5" />
              <DropdownMenuItem asChild className="gap-2 px-2">
                <Link href={routes.fleet}>
                  <Building2 className="size-3.5" />
                  Organization
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="gap-2 px-2">
                <Link href={routes.settings}>
                  <SlidersHorizontal className="size-3.5" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void logOut()} className="gap-2 px-2">
                <LogOut className="size-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 border-border flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur sm:px-6 lg:px-7">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 size-8 md:hidden"
            aria-label="Open navigation"
            aria-expanded={railOpen}
            onClick={() => setRailOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <span className="md:hidden">
            <Spool />
          </span>
          <span className="text-sm font-semibold tracking-tight md:hidden">Spline</span>
          <span className="text-muted-foreground hidden md:inline" aria-hidden>/</span>
          <span className="min-w-0 truncate text-sm font-medium">{titleFor(pathname)}</span>
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
            className="settling mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-7"
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

/**
 * Three mutually exclusive options, shown as one control.
 *
 * As three menu rows they read like three separate commands and the current
 * one is a tick you have to hunt for. As a segment, the choice and the state
 * are the same object — and it does not dismiss the menu on every press,
 * which is what made trying the other two tedious.
 */
function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // `theme` is undefined until the client resolves it; rendering a selection
  // before then briefly marks the wrong one.
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="px-2 py-1.5">
      <p className="label mb-1.5">Appearance</p>
      <div className="bg-muted flex gap-0.5 rounded-md p-0.5">
        {options.map((option) => {
          const active = mounted && theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              title={option.label}
              onClick={(event) => {
                // Keep the menu open: a theme is something you compare, and a
                // menu that dismisses makes you reopen it for every try.
                event.preventDefault();
                event.stopPropagation();
                setTheme(option.value);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <option.icon className="size-3.5 shrink-0" strokeWidth={1.75} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
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

/**
 * The id in a drill-down URL, shortened for the breadcrumb.
 *
 * Only an id: `/organization/machines` has a second segment too, and printing
 * it gave "Machines / machines", which reads like a bug because it is one.
 */
const LOOKS_LIKE_AN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

function detailOf(pathname: string): string | null {
  const last = pathname.split("/").filter(Boolean).at(-1);
  return last && LOOKS_LIKE_AN_ID.test(last) ? last.slice(0, 8) : null;
}

/**
 * The organization, named and renameable.
 *
 * Registering creates one from the person's own display name — a sensible
 * default and a poor label the moment a second person joins. It owns the
 * machines and the agents, so it has to be something an operator can see and
 * say; otherwise "your machines" refers to nothing they recognise.
 */
/**
 * The organization, stated. Not edited here.
 *
 * §18 — it owns the machines, the agents and every workspace, and it appeared
 * nowhere, which made "your machines" a phrase with no referent on screen. A
 * menu is for reading what is true and for going somewhere: a text field
 * inside one has the lifetime of a hover, and buries a setting where nobody
 * looks for it twice. Editing lives on the settings page.
 */
function OrganizationLine() {
  const organization = useOrganization();
  if (!organization) return null;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Building2 className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{organization.name}</span>
        <span className="text-muted-foreground block text-xs">
          owns your machines and agents
        </span>
      </span>
    </div>
  );
}

/** One entry of the rail, wherever the rail happens to be pointing. */
function RailLink({
  item,
  active,
  badge,
}: {
  item: NavItem;
  active: boolean;
  badge: string | null;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon
        className={cn("size-4 shrink-0", active ? "text-signal" : "opacity-70")}
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
  );
}
