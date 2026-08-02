"use client";
import { FormEvent } from "react";
import { LockKeyhole, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
export function LocksPanel() {
  const { locks, pendingAction, error, acquireLock, releaseLock } =
    useWorkspaceDomainStore();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      await acquireLock({
        resourceType: String(d.get("resourceType")),
        resourceId: String(d.get("resourceId")),
        reason: String(d.get("reason")) || undefined,
        scope: String(d.get("scope")) || undefined,
        expiresAt: String(d.get("expiresAt"))
          ? new Date(String(d.get("expiresAt"))).toISOString()
          : undefined,
      });
      e.currentTarget.reset();
    } catch {
      /* Erreur affichée. */
    }
  }
  return (
    <div className="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
      <Card className="border-white/[.075] bg-white/[.018]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-[#f47b64]" />
            <h2 className="text-sm">Acquérir une ressource</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <select
              name="resourceType"
              className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
            >
              <option value="PROCESS">Process</option>
              <option value="TASK">Tâche</option>
              <option value="WORKSPACE_RULESET">Ruleset du workspace</option>
            </select>
            <Input
              name="resourceId"
              required
              placeholder="Identifiant de la ressource"
            />
            <Input name="reason" placeholder="Raison" />
            <Input name="scope" placeholder="Périmètre facultatif" />
            <label className="grid gap-2 text-[10px] text-muted-foreground">
              Expiration
              <Input name="expiresAt" type="datetime-local" />
            </label>
            {error && <p className="text-[10px] text-red-300">{error}</p>}
            <LoadingButton
              type="submit"
              loading={pendingAction === "lock:acquire"}
            >
              Acquérir le lock
            </LoadingButton>
          </form>
        </CardContent>
      </Card>
      <Card className="border-white/[.075] bg-white/[.018]">
        <CardHeader>
          <h2 className="text-sm">Locks du workspace</h2>
        </CardHeader>
        <CardContent className="grid gap-2">
          {locks.map((lock) => (
            <div
              key={lock.id}
              className="flex items-center gap-3 rounded-lg border border-white/[.05] p-3"
            >
              <LockKeyhole
                className={
                  lock.isHeld
                    ? "size-4 text-amber-300"
                    : "size-4 text-muted-foreground"
                }
              />
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-[10px]">
                  {lock.resourceType} · {lock.resourceId}
                </strong>
                <span className="text-[8px] text-muted-foreground">
                  {lock.reason || "Sans raison"} · {lock.lockedByType}{" "}
                  {lock.lockedById}
                </span>
              </div>
              <Badge variant="outline">
                {lock.isHeld ? "Détenu" : "Libéré"}
              </Badge>
              {lock.isHeld && (
                <LoadingButton
                  loading={pendingAction === `lock:${lock.id}`}
                  onClick={() => void releaseLock(lock.id)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Unlock />
                </LoadingButton>
              )}
            </div>
          ))}
          {!locks.length && (
            <p className="text-[10px] text-muted-foreground">
              Aucun lock enregistré.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
