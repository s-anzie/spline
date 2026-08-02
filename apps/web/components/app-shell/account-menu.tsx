"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronUp,
  LayoutGrid,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/api/types";

export function AccountMenu({
  user,
  initials,
  onLogout,
}: {
  user: User | null;
  initials: string;
  onLogout: () => void;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="group/account h-auto w-full justify-center gap-2 rounded-xl border border-transparent px-1.5 py-2 text-left text-[#85817d] transition-all hover:border-white/[.06] hover:bg-white/[.035] hover:text-[#e6e1dc] md:justify-start"
          />
        }
      >
        <span className="relative shrink-0">
          <Avatar className="size-8 ring-1 ring-white/10 transition-transform duration-200 group-hover/account:scale-105">
            <AvatarFallback className="bg-gradient-to-br from-[#3b2c29] to-[#261f1d] text-[10px] font-semibold text-[#f6a18f]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#11100f] bg-emerald-400" />
        </span>
        <span className="hidden min-w-0 flex-1 flex-col md:flex">
          <strong className="truncate text-[11px] font-medium text-[#e6e1dc]">
            {user?.displayName ?? "Compte"}
          </strong>
          <small className="truncate text-[9px] text-muted-foreground">
            {user?.email}
          </small>
        </span>
        <ChevronUp className="hidden size-3 transition-transform duration-200 group-aria-expanded/account:rotate-180 md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-68 border-white/[.08] bg-[#191715]/98 p-1.5 text-[#f2efea] shadow-[0_20px_60px_-18px_rgba(0,0,0,.85)] backdrop-blur-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="mb-1 flex items-center gap-3 rounded-lg border border-white/[.055] bg-gradient-to-br from-white/[.045] to-transparent px-3 py-3">
            <Avatar className="size-9 shrink-0 ring-1 ring-white/10">
              <AvatarFallback className="bg-[#312725] text-[10px] font-semibold text-[#f6a18f]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold text-[#f1ece7]">
                {user?.displayName}
              </span>
              <span className="mt-0.5 block truncate text-[8px] font-normal text-[#8f8a85]">
                {user?.email}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => router.push("/settings")}
            className="gap-2.5 px-2.5 py-2 text-[11px] text-[#d8d3ce] focus:bg-white/[.06] focus:text-white"
          >
            <UserRound />
            Mon compte<DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push("/settings")}
            className="gap-2.5 px-2.5 py-2 text-[11px] text-[#d8d3ce] focus:bg-white/[.06] focus:text-white"
          >
            <Settings />
            Paramètres
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-white/[.07]" />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[8px] font-semibold uppercase tracking-[.14em] text-[#615d59]">
            Accès rapides
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => router.push("/inbox")}
            className="gap-2.5 px-2.5 py-2 text-[11px] text-[#d8d3ce] focus:bg-white/[.06] focus:text-white"
          >
            <Bell />
            Boîte de réception
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push("/validations")}
            className="gap-2.5 px-2.5 py-2 text-[11px] text-[#d8d3ce] focus:bg-white/[.06] focus:text-white"
          >
            <ShieldCheck />
            Validations
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push("/workspaces")}
            className="gap-2.5 px-2.5 py-2 text-[11px] text-[#d8d3ce] focus:bg-white/[.06] focus:text-white"
          >
            <LayoutGrid />
            Tous les workspaces
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-white/[.07]" />
        <DropdownMenuItem
          onClick={onLogout}
          variant="destructive"
          className="gap-2.5 px-2.5 py-2 text-[11px] focus:bg-red-400/10"
        >
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
