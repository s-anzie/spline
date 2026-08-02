"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  CircleDot,
  Clock3,
  Copy,
  KeyRound,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Network,
  Plus,
  Radio,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanningStore } from "@/stores/planning-store";
import { useRealtimeStore } from "@/stores/realtime-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

function tokenExpiry(token: string | null) {
  if (!token) return null;
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;
    const payload = JSON.parse(
      atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

export function AccountSettings() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const {
    workspaces,
    loading,
    loadWorkspaces,
    reset: resetWorkspaces,
  } = useWorkspaceStore();
  const resetPlanning = usePlanningStore((state) => state.reset);
  const resetDomains = useWorkspaceDomainStore((state) => state.reset);
  const connected = useRealtimeStore((state) => state.connected);
  const lastEvent = useRealtimeStore((state) => state.lastEvent);
  const [copied, setCopied] = useState(false);
  const expiresAt = useMemo(() => tokenExpiry(token), [token]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  async function copyId() {
    if (!user) return;
    await navigator.clipboard.writeText(user.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function handleLogout() {
    resetWorkspaces();
    resetPlanning();
    resetDomains();
    logout();
  }

  return (
    <>
      <PageHeader
        eyebrow="Compte & application"
        title="Paramètres"
        description="Votre identité, votre session et les réglages réellement disponibles dans Spline."
        actions={
          <Badge
            variant="outline"
            className={
              connected
                ? "border-emerald-400/20 text-emerald-300"
                : "border-amber-400/20 text-amber-300"
            }
          >
            <CircleDot className="mr-1 size-3" />
            {connected ? "Temps réel connecté" : "Temps réel déconnecté"}
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="grid gap-4">
          <Card className="overflow-hidden border-white/[.075] bg-white/[.018]">
            <div className="h-20 border-b border-white/[.055] bg-[radial-gradient(circle_at_20%_0%,rgba(244,123,100,.17),transparent_55%)]" />
            <CardContent className="relative grid gap-5 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="-mt-7 flex items-end justify-between">
                <div className="grid size-14 place-items-center rounded-2xl border-4 border-[#141311] bg-gradient-to-br from-[#55332e] to-[#28211f] text-sm font-semibold text-[#ffc0b2] shadow-xl">
                  {user?.displayName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase() || "U"}
                </div>
                <Badge className="mb-1 border-0 bg-emerald-400/10 text-[9px] text-emerald-300">
                  Compte actif
                </Badge>
              </div>
              <div>
                <h2 className="text-base font-medium">{user?.displayName}</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {user?.email}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-[10px] text-muted-foreground">
                  Nom affiché
                  <Input
                    value={user?.displayName ?? ""}
                    readOnly
                    className="bg-white/[.02] text-foreground"
                  />
                </label>
                <label className="grid gap-2 text-[10px] text-muted-foreground">
                  Adresse e-mail
                  <Input
                    value={user?.email ?? ""}
                    readOnly
                    className="bg-white/[.02] text-foreground"
                  />
                </label>
              </div>
              <div className="flex gap-2 rounded-lg border border-white/[.06] bg-white/[.015] p-3 text-[9px] leading-4 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-4 shrink-0" />
                <p>
                  Le backend n’expose pas encore de mutation du profil ou du mot
                  de passe. Les champs restent en lecture seule pour ne pas
                  simuler un enregistrement inexistant.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="size-4 text-[#f47b64]" />
                  <h2 className="text-sm">Vos workspaces</h2>
                </div>
                <Badge variant="outline">{workspaces.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {workspaces.slice(0, 4).map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/workspaces/${workspace.id}`}
                  className="group flex items-center gap-3 rounded-lg border border-white/[.055] p-3 transition-colors hover:border-[#f47b64]/20 hover:bg-white/[.025]"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-[#f47b64]/10 text-[9px] font-semibold text-[#f6a18f]">
                    {workspace.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[10px]">
                      {workspace.name}
                    </strong>
                    <small className="text-[8px] text-muted-foreground">
                      {workspace.status}
                    </small>
                  </span>
                  <span className="text-[9px] text-muted-foreground transition-transform group-hover:translate-x-0.5">
                    Ouvrir →
                  </span>
                </Link>
              ))}
              {!loading && !workspaces.length && (
                <p className="py-5 text-center text-[10px] text-muted-foreground">
                  Aucun workspace associé à ce compte.
                </p>
              )}
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Button
                  nativeButton={false}
                  render={<Link href="/workspaces" />}
                  variant="outline"
                  size="sm"
                >
                  <LayoutGrid />
                  Tout afficher
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href="/workspaces/new" />}
                  variant="outline"
                  size="sm"
                >
                  <Plus />
                  Créer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-[#f47b64]" />
                <h2 className="text-sm">Session et sécurité</h2>
              </div>
            </CardHeader>
            <CardContent className="grid gap-1">
              <div className="flex items-center gap-3 rounded-lg px-2 py-3">
                <Clock3 className="size-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-[10px]">Expiration du jeton</p>
                  <small className="text-[8px] text-muted-foreground">
                    {expiresAt
                      ? expiresAt.toLocaleString("fr-FR")
                      : "Non communiquée"}
                  </small>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg px-2 py-3">
                <UserRound className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px]">Identifiant utilisateur</p>
                  <small className="block truncate font-mono text-[8px] text-muted-foreground">
                    {user?.id}
                  </small>
                </div>
                <Button
                  onClick={() => void copyId()}
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Copier l’identifiant"
                >
                  {copied ? <Check className="text-emerald-300" /> : <Copy />}
                </Button>
              </div>
              <div className="mt-2 border-t border-white/[.055] pt-3">
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full border-red-400/10 text-red-300 hover:bg-red-400/10 hover:text-red-200"
                >
                  <LogOut />
                  Se déconnecter de cet appareil
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-[#f47b64]" />
                <h2 className="text-sm">État de l’application</h2>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-center justify-between rounded-lg border border-white/[.055] p-3">
                <span className="flex items-center gap-2 text-[10px]">
                  <Network className="size-4 text-muted-foreground" />
                  API via proxy sécurisé
                </span>
                <Badge variant="outline" className="text-emerald-300">
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[.055] p-3">
                <span className="flex items-center gap-2 text-[10px]">
                  <Radio className="size-4 text-muted-foreground" />
                  Canal temps réel
                </span>
                <Badge
                  variant="outline"
                  className={connected ? "text-emerald-300" : "text-amber-300"}
                >
                  {connected ? "Connecté" : "Hors ligne"}
                </Badge>
              </div>
              <p className="truncate px-1 text-[8px] text-muted-foreground">
                {lastEvent
                  ? `Dernier événement : ${lastEvent}`
                  : "Aucun événement temps réel reçu pendant cette session."}
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <h2 className="text-sm">Accès rapides</h2>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button
                nativeButton={false}
                render={<Link href="/inbox" />}
                variant="ghost"
                className="justify-start"
              >
                <Bell />
                Réception
              </Button>
              <Button
                nativeButton={false}
                render={<Link href="/infrastructure" />}
                variant="ghost"
                className="justify-start"
              >
                <Network />
                Infrastructure
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
