"use client";

import {
  Activity as ActivityIcon,
  Cpu,
  Inbox as InboxIcon,
  ListChecks,
  Moon,
  Play,
  Settings2,
  Sun,
  Target,
  TriangleAlert,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useSession, type Screen } from "@/lib/store";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const DESTINATIONS: { screen: Screen; label: string; icon: typeof Target; hint: string }[] =
  [
    { screen: "queue", label: "Queue", icon: TriangleAlert, hint: "what needs a person" },
    { screen: "goals", label: "Goals", icon: Target, hint: "what this is all for" },
    { screen: "tasks", label: "Tasks", icon: ListChecks, hint: "the unit of work" },
    { screen: "runs", label: "Runs", icon: Play, hint: "what executed, and what it cost" },
    { screen: "machines", label: "Machines", icon: Cpu, hint: "what runs the agents" },
    { screen: "activity", label: "Activity", icon: ActivityIcon, hint: "the journal" },
    { screen: "inbox", label: "Inbox", icon: InboxIcon, hint: "addressed to you" },
    { screen: "workspace", label: "Workspace", icon: Settings2, hint: "health, people, rules" },
  ];

/**
 * ⌘K.
 *
 * Navigation and the workspace switch, from the keyboard. Deliberately not a
 * search over the hub's data: a palette that queried five workspace-scoped
 * routes on every keystroke would be a way to read across workspaces by
 * accident, and §4.2 does not bend for convenience.
 */
export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaces, workspaceId, go, chooseWorkspace } = useSession();
  const { theme, setTheme } = useTheme();

  const run = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to"
      description="Jump to a screen, or switch workspace"
    >
      <CommandInput placeholder="Go to…" />
      <CommandList>
        <CommandEmpty>Nothing by that name.</CommandEmpty>

        <CommandGroup heading="Screens">
          {DESTINATIONS.map((destination) => (
            <CommandItem
              key={destination.screen}
              value={`${destination.label} ${destination.hint}`}
              onSelect={() => run(() => go(destination.screen))}
            >
              <destination.icon className="size-4 opacity-70" strokeWidth={1.75} />
              <span>{destination.label}</span>
              <span className="text-muted-foreground ml-auto text-xs">
                {destination.hint}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {workspaces.length > 1 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Workspaces">
              {workspaces
                .filter((workspace) => workspace.id !== workspaceId)
                .map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={`workspace ${workspace.name}`}
                    onSelect={() => run(() => chooseWorkspace(workspace.id))}
                  >
                    <span className="measure text-muted-foreground text-xs">↳</span>
                    <span>{workspace.name}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        ) : null}

        <CommandSeparator />
        <CommandGroup heading="Appearance">
          <CommandItem
            value="theme dark light toggle appearance"
            onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? (
              <Sun className="size-4 opacity-70" />
            ) : (
              <Moon className="size-4 opacity-70" />
            )}
            <span>Switch to {theme === "dark" ? "light" : "dark"}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
