"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CircleHelp,
  Inbox,
  MessageSquareText,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InboxItem } from "@/stores/notification-store";
import { useNotificationStore } from "@/stores/notification-store";

function destination(item: InboxItem): string {
  const { notification } = item;
  const payload = notification.payload;
  if (payload["collaborationType"] === "MANAGER_HUMAN_QUESTION")
    return `/workspaces/${notification.workspaceId}/attention`;
  if (
    payload["type"] === "agent_session_failure" &&
    typeof payload["sessionId"] === "string"
  )
    return `/workspaces/${notification.workspaceId}/execution?session=${payload["sessionId"]}`;
  return `/workspaces/${notification.workspaceId}/activity`;
}

function NotificationIcon({ item }: { item: InboxItem }) {
  const payload = item.notification.payload;
  if (payload["collaborationType"] === "MANAGER_HUMAN_QUESTION")
    return <CircleHelp className="size-4" />;
  if (payload["type"] === "agent_session_failure")
    return <ShieldAlert className="size-4" />;
  if (item.notification.kind === "SYSTEM_ALERT")
    return <AlertTriangle className="size-4" />;
  return <MessageSquareText className="size-4" />;
}

export function NotificationMenu({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const { items, loading, load, advance } = useNotificationStore();
  const [clearing, setClearing] = useState(false);

  async function openItem(item: InboxItem) {
    const status = item.recipient.deliveryStatus;
    if (status === "PENDING" || status === "DELIVERED") {
      try {
        await advance(item, "SEEN");
      } catch {
        // Navigation remains useful even if the receipt cannot be persisted.
      }
    }
    router.push(destination(item));
  }

  async function markAllSeen() {
    setClearing(true);
    try {
      await Promise.all(
        items.map((item) => advance(item, "SEEN").catch(() => undefined)),
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && void load(true)}>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-lg"
            variant="outline"
            className="relative hidden border-white/[.075] bg-white/[.025] text-muted-foreground sm:inline-flex"
            aria-label="Ouvrir les notifications"
          />
        }
      >
        <Bell />
        {items.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[#f47b64] px-1 py-0.5 text-[7px] font-bold text-[#241614] shadow-[0_0_0_3px_#11100f]">
            {items.length > 99 ? "99+" : items.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden border-white/[.08] bg-[#191715]/98 p-0 text-[#f2efea] shadow-[0_24px_70px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-white/[.07] px-4 py-3">
          <div>
            <strong className="block text-[11px]">Notifications</strong>
            <span className="text-[8px] text-muted-foreground">
              {items.length} non lue{items.length > 1 ? "s" : ""}
            </span>
          </div>
          {items.length > 0 && (
            <Button
              size="xs"
              variant="ghost"
              disabled={clearing}
              onClick={() => void markAllSeen()}
            >
              <CheckCheck className={clearing ? "animate-pulse" : ""} />
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <DropdownMenuGroup className="app-scrollbar max-h-[25rem] overflow-y-auto p-1.5">
          {items.slice(0, 8).map((item) => (
            <DropdownMenuItem
              key={item.notification.id}
              onClick={() => void openItem(item)}
              className="items-start gap-3 rounded-lg px-2.5 py-2.5 text-[#ddd8d2] focus:bg-white/[.055] focus:text-white"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#f47b64]/10 text-[#f47b64]">
                <NotificationIcon item={item} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-medium">
                  {item.notification.title || item.notification.kind}
                </span>
                <span className="mt-1 line-clamp-2 block text-[9px] leading-4 text-[#99938d]">
                  {item.notification.body}
                </span>
                <span className="mt-1.5 block text-[7px] text-[#68635e]">
                  {new Date(item.notification.createdAt).toLocaleString("fr-FR")}
                </span>
              </span>
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#f47b64]" />
            </DropdownMenuItem>
          ))}
          {!loading && items.length === 0 && (
            <div className="grid min-h-32 place-items-center px-6 text-center">
              <div>
                <CheckCheck className="mx-auto size-5 text-emerald-400" />
                <p className="mt-2 text-[10px]">Tout est lu</p>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  Les nouvelles informations apparaîtront ici.
                </p>
              </div>
            </div>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="m-0 bg-white/[.07]" />
        <div className="grid grid-cols-2 gap-px bg-white/[.06]">
          <button
            type="button"
            onClick={() => router.push("/inbox")}
            className="flex items-center justify-center gap-2 bg-[#191715] px-3 py-2.5 text-[9px] text-muted-foreground transition hover:bg-white/[.035] hover:text-foreground"
          >
            <Inbox className="size-3.5" /> Toute la boîte
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(
                workspaceId
                  ? `/workspaces/${workspaceId}/attention`
                  : "/attention",
              )
            }
            className="flex items-center justify-center gap-2 bg-[#191715] px-3 py-2.5 text-[9px] text-muted-foreground transition hover:bg-white/[.035] hover:text-foreground"
          >
            <ShieldAlert className="size-3.5" /> Interventions
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
