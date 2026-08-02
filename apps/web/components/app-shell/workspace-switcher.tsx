"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  LayoutGrid,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  workspaceColor,
  workspaceInitials,
} from "@/lib/workspace-presentation";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function WorkspaceSwitcher({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const loading = useWorkspaceStore((state) => state.loading);
  const initialized = useWorkspaceStore((state) => state.initialized);
  const error = useWorkspaceStore((state) => state.error);
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces);
  const setActiveWorkspace = useWorkspaceStore(
    (state) => state.setActiveWorkspace,
  );
  const workspace = workspaces.find((item) => item.id === workspaceId);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);
  useEffect(
    () => setActiveWorkspace(workspaceId ?? null),
    [setActiveWorkspace, workspaceId],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="group/switcher mt-6 h-auto w-full justify-center border-white/[.075] bg-white/[.025] p-2 hover:border-[#f47b64]/25 hover:shadow-[0_8px_24px_-16px_rgba(244,123,100,.6)] md:justify-start"
          />
        }
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#f47b64] to-[#bd4e45] text-xs font-bold shadow-[0_5px_16px_-8px_rgba(244,123,100,.8)] transition-transform duration-300 group-hover/switcher:rotate-3 group-hover/switcher:scale-105">
          {loading && !initialized ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            workspaceInitials(workspace?.name ?? "Workspace")
          )}
        </span>
        <span className="hidden min-w-0 flex-1 flex-col items-start md:flex">
          <strong className="max-w-32 truncate text-xs font-medium">
            {workspace?.name ?? "Choisir un workspace"}
          </strong>
          <small className="text-[9px] text-muted-foreground">
            {workspace ? "Contexte actif" : "Aucun contexte actif"}
          </small>
        </span>
        <ChevronsUpDown className="hidden size-3 text-muted-foreground transition-transform duration-200 group-aria-expanded/switcher:rotate-180 md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={10}
        className="w-72 border-white/[.08] bg-[#191715]/98 p-1.5 text-[#f2efea] shadow-[0_20px_60px_-18px_rgba(0,0,0,.85)] backdrop-blur-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="mb-1 rounded-lg border border-white/[.055] bg-white/[.025] px-3 py-2.5">
            <span className="block text-[10px] font-semibold text-[#eee9e4]">
              Changer de contexte
            </span>
            <span className="mt-0.5 block text-[8px] font-normal leading-3 text-[#8f8a85]">
              Toute l’application se recentre sur le workspace choisi.
            </span>
          </DropdownMenuLabel>
          {error && (
            <DropdownMenuItem
              onClick={() => void loadWorkspaces(true)}
              className="gap-2 text-red-300"
            >
              <AlertCircle />
              <span className="flex-1 truncate">{error}</span>
              <RefreshCw />
            </DropdownMenuItem>
          )}
          {!error && initialized && workspaces.length === 0 && (
            <DropdownMenuItem disabled>
              Aucun workspace pour le moment
            </DropdownMenuItem>
          )}
          {workspaces.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => router.push(`/workspaces/${item.id}`)}
              className={cn(
                "group/item my-0.5 gap-3 px-2.5 py-2.5 text-[#d8d3ce] transition-colors duration-150 focus:bg-white/[.06] focus:text-white",
                item.id === workspaceId && "bg-[#f47b64]/[.075]",
              )}
            >
              <span
                className="grid size-8 place-items-center rounded-lg border border-white/[.06] text-[8px] font-semibold shadow-sm transition-transform duration-200 group-hover/item:scale-105"
                style={{
                  backgroundColor: `${workspaceColor(item.id)}18`,
                  color: workspaceColor(item.id),
                }}
              >
                {workspaceInitials(item.name)}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[11px] font-medium">
                  {item.name}
                </strong>
                <small className="mt-0.5 block text-[8px] text-[#77736f]">
                  {item.id === workspaceId
                    ? "Contexte actuellement actif"
                    : item.status === "ACTIVE"
                      ? "Disponible"
                      : item.status}
                </small>
              </span>
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full bg-[#f47b64]/15",
                  item.id !== workspaceId && "opacity-0",
                )}
              >
                <Check className="size-3 text-[#f47b64]" />
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-white/[.07]" />
        <div className="grid grid-cols-2 gap-1">
          <DropdownMenuItem
            onClick={() => router.push("/dashboard")}
            className="justify-center gap-2 px-2 py-2 text-[10px] text-[#aaa5a0] focus:bg-white/[.055] focus:text-white"
          >
            <LayoutGrid />
            Vue globale
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push("/workspaces/new")}
            className="justify-center gap-2 bg-[#f47b64]/10 px-2 py-2 text-[10px] text-[#f6a18f] focus:bg-[#f47b64]/15 focus:text-[#ffc0b2]"
          >
            <Plus />
            Créer
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
