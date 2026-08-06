"use client";

import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { NAV, routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const DESTINATIONS = NAV.flatMap((group) => group.items);

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
  const router = useRouter();
  const { workspaces, workspaceId, chooseWorkspace } = useSession();
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
              key={destination.href}
              value={`${destination.label} ${destination.hint}`}
              onSelect={() => run(() => router.push(destination.href))}
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
                    onSelect={() =>
                      run(() => {
                        chooseWorkspace(workspace.id);
                        router.push(routes.queue);
                      })
                    }
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
