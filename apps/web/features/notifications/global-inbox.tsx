"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  Eye,
  MessageSquareReply,
  RefreshCw,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import type { InboxItem } from "@/stores/notification-store";
import { useNotificationStore } from "@/stores/notification-store";

export function GlobalInbox({ attention = false }: { attention?: boolean }) {
  const { items, loading, error, load, advance: advanceItem } = useNotificationStore();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(item: InboxItem, status: string) {
    setPending(item.notification.id);
    try {
      await advanceItem(item, status);
    } catch {
      // Le store conserve l’erreur de chargement ; l’action reste réessayable.
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Tous workspaces"
        title={attention ? "À traiter" : "Boîte de réception"}
        description={
          attention
            ? "Alertes et demandes qui nécessitent une intervention réelle de votre part."
            : "Notifications encore à consulter ou à traiter sur tous les workspaces."
        }
        actions={
          <>
            <Badge variant="outline">{items.length} en attente</Badge>
            <LoadingButton
              loading={loading}
              onClick={() => void load()}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCw />
            </LoadingButton>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex gap-2 rounded-lg border border-red-400/15 p-3 text-[10px] text-red-300">
          <AlertCircle className="size-4" /> {error}
        </div>
      )}

      <Card className="border-white/[.075] bg-white/[.018]">
        <CardContent className="divide-y divide-white/[.055] p-0">
          {items.map((item) => {
            const notification = item.notification;
            const status = item.recipient.deliveryStatus;
            const payload = notification.payload;
            const managerQuestion =
              payload["collaborationType"] === "MANAGER_HUMAN_QUESTION";
            const sessionFailure = payload["type"] === "agent_session_failure";
            const options = Array.isArray(payload["options"])
              ? payload["options"].filter(
                  (option): option is string => typeof option === "string",
                )
              : [];
            const context =
              typeof payload["context"] === "string" ? payload["context"] : null;
            const recommendation =
              typeof payload["recommendation"] === "string"
                ? payload["recommendation"]
                : null;
            return (
              <div
                key={notification.id}
                className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f47b64]/10 text-[#f47b64]">
                  {managerQuestion ? (
                    <MessageSquareReply className="size-4" />
                  ) : (
                    <Bell className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <strong className="text-xs">
                      {notification.title || notification.kind}
                    </strong>
                    {managerQuestion && <Badge variant="outline">Manager</Badge>}
                    <Badge variant="outline">{status}</Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-foreground">
                    {notification.body}
                  </p>
                  {managerQuestion && (context || options.length > 0 || recommendation) && (
                    <div className="mt-3 grid gap-2 text-[9px] sm:grid-cols-2">
                      {context && (
                        <div className="rounded-lg border border-white/[.06] p-3 text-muted-foreground sm:col-span-2">
                          {context}
                        </div>
                      )}
                      {options.length > 0 && (
                        <div className="rounded-lg border border-white/[.06] p-3">
                          <p className="mb-1.5 uppercase tracking-wider text-muted-foreground">
                            Options
                          </p>
                          <ul className="list-inside list-disc space-y-1">
                            {options.map((option) => (
                              <li key={option}>{option}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {recommendation && (
                        <div className="rounded-lg border border-[#f47b64]/15 bg-[#f47b64]/[.035] p-3">
                          <p className="mb-1.5 uppercase tracking-wider text-muted-foreground">
                            Recommandation
                          </p>
                          {recommendation}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      nativeButton={false}
                      render={
                        <Link
                          href={managerQuestion
                            ? `/workspaces/${notification.workspaceId}/attention`
                            : sessionFailure && typeof payload["sessionId"] === "string"
                              ? `/workspaces/${notification.workspaceId}/execution?session=${payload["sessionId"]}`
                              : `/workspaces/${notification.workspaceId}/activity`}
                        />
                      }
                      size="xs"
                      variant={managerQuestion ? "default" : "ghost"}
                    >
                      {managerQuestion ? "Répondre au manager" : "Ouvrir le workspace"}
                    </Button>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {(status === "PENDING" || status === "DELIVERED") && (
                    <LoadingButton
                      loading={pending === notification.id}
                      onClick={() => void advance(item, "SEEN")}
                      size="sm"
                      variant="outline"
                    >
                      <Eye /> Voir
                    </LoadingButton>
                  )}
                  {status === "SEEN" && (
                    <LoadingButton
                      loading={pending === notification.id}
                      onClick={() => void advance(item, "ACKNOWLEDGED")}
                      size="sm"
                      variant="outline"
                    >
                      <CheckCheck /> Acquitter
                    </LoadingButton>
                  )}
                  {status === "ACKNOWLEDGED" && (
                    <LoadingButton
                      loading={pending === notification.id}
                      onClick={() => void advance(item, "ACTED_ON")}
                      size="sm"
                      className="bg-[#f47b64] text-[#241614]"
                    >
                      <Check /> Traitée
                    </LoadingButton>
                  )}
                </div>
              </div>
            );
          })}

          {!loading && items.length === 0 && (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <Check className="mx-auto size-7 text-emerald-400" />
                <h2 className="mt-3 text-sm">Tout est traité</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Aucune notification non lue.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
