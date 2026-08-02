"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  HardDrive,
  KeyRound,
  Plus,
  Server,
  TriangleAlert,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/shared/page-header";
import { domainApi } from "@/lib/api/domains";
import type { Machine } from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
export function MachinesView() {
  const token = useAuthStore((s) => s.token);
  const { workspaces, loadWorkspaces } = useWorkspaceStore();
  const [selected, setSelected] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    machine: Machine;
    action: "rotate" | "revoke";
  } | null>(null);
  const [pendingMachine, setPendingMachine] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);
  useEffect(() => {
    if (!selected && workspaces[0]) setSelected(workspaces[0].id);
  }, [selected, workspaces]);
  useEffect(() => {
    if (!token || !selected) return;
    setLoading(true);
    void domainApi
      .machines(selected, token)
      .then(setMachines)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Chargement impossible"),
      )
      .finally(() => setLoading(false));
  }, [selected, token]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !selected) return;
    const d = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const machine = await domainApi.registerMachine(
        { hostname: String(d.get("hostname")), os: String(d.get("os")) },
        token,
      );
      const linked = await domainApi.linkMachine(selected, machine.id, token);
      setMachines((current) => [linked, ...current]);
      setSecret(machine.token);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible",
      );
    } finally {
      setLoading(false);
    }
  }
  async function manageCredential() {
    if (!token || !selected || !confirmation) return;
    const { machine, action } = confirmation;
    setPendingMachine(machine.id);
    setError(null);
    try {
      if (action === "rotate") {
        const result = await domainApi.rotateMachineToken(
          selected,
          machine.id,
          token,
        );
        setRotatedSecret(result.token);
      } else {
        await domainApi.revokeMachineToken(selected, machine.id, token);
      }
      setMachines((current) =>
        current.map((item) =>
          item.id === machine.id ? { ...item, runtimeStatus: "OFFLINE" } : item,
        ),
      );
      setConfirmation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setPendingMachine(null);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Runtime coordination"
        title="Machines locales"
        description="Enregistrement global, token runtime à usage unique et liaison explicite à un workspace."
        actions={
          <Dialog onOpenChange={(open) => !open && setSecret(null)}>
            <DialogTrigger
              render={<Button className="bg-[#f47b64] text-[#241614]" />}
            >
              <Plus />
              Enregistrer une machine
            </DialogTrigger>
            <DialogContent className="border-white/10 bg-[#191715] text-foreground">
              <DialogHeader>
                <DialogTitle>
                  {secret ? "Machine enregistrée" : "Nouvelle machine"}
                </DialogTitle>
                <DialogDescription>
                  Le token permet au runtime local de se connecter au gateway.
                </DialogDescription>
              </DialogHeader>
              {secret ? (
                <div className="grid gap-4">
                  <Check className="mx-auto size-9 text-emerald-400" />
                  <code className="break-all rounded-lg border border-amber-400/15 p-3 text-[9px]">
                    {secret}
                  </code>
                  <Button
                    onClick={() => void navigator.clipboard.writeText(secret)}
                    variant="outline"
                  >
                    <Copy />
                    Copier le token
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="grid gap-3">
                  <Input name="hostname" required placeholder="bradley-dev" />
                  <Input name="os" required placeholder="Linux x64" />
                  <label className="grid gap-2 text-xs">
                    Workspace
                    <select
                      name="workspaceId"
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                      className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {error && <p className="text-[10px] text-red-300">{error}</p>}
                  <LoadingButton type="submit" loading={loading}>
                    Enregistrer et lier
                  </LoadingButton>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <div className="mb-5 flex items-center gap-3">
        <label className="text-[10px] text-muted-foreground">
          Workspace observé
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {machines.map((machine) => (
          <Card
            key={machine.id}
            className="border-white/[.075] bg-white/[.018]"
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300">
                  <HardDrive />
                </span>
                <div className="flex-1">
                  <h2 className="text-sm">{machine.hostname}</h2>
                  <p className="text-[9px] text-muted-foreground">
                    {machine.os}
                  </p>
                </div>
                <Badge variant="outline">{machine.runtimeStatus}</Badge>
              </div>
              <div className="mt-5 flex justify-between text-[9px] text-muted-foreground">
                <span>Dernier heartbeat</span>
                <strong>
                  {machine.lastSeenAt
                    ? new Date(machine.lastSeenAt).toLocaleString("fr-FR")
                    : "Jamais"}
                </strong>
              </div>
              <div className="mt-4 flex gap-2 border-t border-white/[.055] pt-4">
                <Button
                  onClick={() => setConfirmation({ machine, action: "rotate" })}
                  disabled={pendingMachine === machine.id}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  <KeyRound />
                  Faire tourner le token
                </Button>
                <Button
                  onClick={() => setConfirmation({ machine, action: "revoke" })}
                  disabled={pendingMachine === machine.id}
                  size="sm"
                  variant="ghost"
                  className="text-red-300 hover:bg-red-400/10 hover:text-red-200"
                >
                  <Ban />
                  Révoquer
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && !machines.length && (
          <Card className="border-dashed">
            <CardContent className="grid min-h-48 place-items-center">
              <div className="text-center">
                <Server className="mx-auto text-muted-foreground" />
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Aucune machine liée à ce workspace.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      {error && <p className="mt-4 text-[10px] text-red-300">{error}</p>}
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <AlertDialogContent className="border-white/10 bg-[#191715] text-foreground">
          <AlertDialogHeader>
            <span className="mb-2 grid size-10 place-items-center rounded-full bg-amber-400/10 text-amber-300">
              <TriangleAlert />
            </span>
            <AlertDialogTitle>
              {confirmation?.action === "rotate"
                ? "Faire tourner ce token ?"
                : "Révoquer ce token ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.action === "rotate"
                ? "L’ancien token sera immédiatement invalidé et le runtime sera déconnecté. Tu devras configurer le nouveau token sur la machine puis redémarrer le runtime."
                : "Le runtime sera immédiatement déconnecté et ne pourra plus recevoir de commandes. Une rotation ultérieure permettra de créer un nouvel accès."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingMachine !== null}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void manageCredential()}
              disabled={pendingMachine !== null}
              variant={
                confirmation?.action === "revoke" ? "destructive" : "default"
              }
            >
              {confirmation?.action === "rotate" ? <KeyRound /> : <Ban />}
              {pendingMachine !== null
                ? "Traitement…"
                : confirmation?.action === "rotate"
                  ? "Renouveler et déconnecter"
                  : "Révoquer et déconnecter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={rotatedSecret !== null}
        onOpenChange={(open) => !open && setRotatedSecret(null)}
      >
        <DialogContent className="border-white/10 bg-[#191715] text-foreground">
          <DialogHeader>
            <DialogTitle>Nouveau token machine</DialogTitle>
            <DialogDescription>
              Il ne sera affiché qu’une seule fois. Remplace `MACHINE_TOKEN`,
              puis redémarre le runtime.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <code className="break-all rounded-lg border border-amber-400/15 bg-black/15 p-3 text-[9px]">
              {rotatedSecret}
            </code>
            <Button
              onClick={() =>
                rotatedSecret &&
                void navigator.clipboard.writeText(rotatedSecret)
              }
              variant="outline"
            >
              <Copy />
              Copier le nouveau token
            </Button>
            <pre className="overflow-x-auto rounded-lg bg-black/20 p-3 text-[9px] text-muted-foreground">
              <code>{`HUB_URL=http://localhost:8765 \\\nMACHINE_TOKEN='…' \\\nnpm run dev -w apps/runtime`}</code>
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
