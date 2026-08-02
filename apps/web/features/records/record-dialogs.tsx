"use client";
import { FormEvent, useState } from "react";
import { Activity, Bell, FilePlus2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
function Shell({
  kind,
  children,
}: {
  kind: "artifact" | "decision" | "notification" | "event";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const config = {
    artifact: [FilePlus2, "Nouvel artefact"],
    decision: [Scale, "Consigner une décision"],
    notification: [Bell, "Envoyer une notification"],
    event: [Activity, "Consigner un événement"],
  } as const;
  const [Icon, label] = config[kind];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button className="bg-[#f47b64] text-[#241614]" />}
      >
        <Icon />
        {label}
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#191715] text-foreground">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Cette donnée sera enregistrée et diffusée par le backend du
            workspace.
          </DialogDescription>
        </DialogHeader>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}
export function EventDialog() {
  const create = useWorkspaceDomainStore((s) => s.createEvent);
  const pending =
    useWorkspaceDomainStore((s) => s.pendingAction) === "event:create";
  const error = useWorkspaceDomainStore((s) => s.error);
  return (
    <Shell kind="event">
      {(close) => (
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(String(d.get("payload")) || "{}") as Record<
                string,
                unknown
              >;
            } catch {
              useWorkspaceDomainStore.setState({
                error: "Le payload doit être un objet JSON valide.",
              });
              return;
            }
            try {
              await create({
                type: String(d.get("type")),
                severity: String(d.get("severity")),
                payload,
                target: String(d.get("targetId")) ? {type:String(d.get("targetType")),id:String(d.get("targetId"))} : undefined,
              });
              close();
            } catch {
              /* Erreur affichée. */
            }
          }}
          className="grid gap-3"
        >
          <Input name="type" required placeholder="deployment.requested" />
          <select
            name="severity"
            defaultValue="INFO"
            className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
          >
            <option value="DEBUG">Debug</option>
            <option value="INFO">Information</option>
            <option value="WARNING">Avertissement</option>
            <option value="ERROR">Erreur</option>
            <option value="CRITICAL">Critique</option>
          </select>
          <div className="grid grid-cols-2 gap-2"><Input name="targetType" placeholder="Type de cible"/><Input name="targetId" placeholder="ID de cible"/></div>
          <textarea
            name="payload"
            defaultValue="{}"
            className="min-h-28 rounded-lg border border-white/10 bg-black/15 p-3 font-mono text-[10px] outline-none"
          />
          {error && <p className="text-[10px] text-red-300">{error}</p>}
          <LoadingButton type="submit" loading={pending}>
            Consigner
          </LoadingButton>
        </form>
      )}
    </Shell>
  );
}
export function ArtifactDialog() {
  const create = useWorkspaceDomainStore((s) => s.createArtifact);
  const pending =
    useWorkspaceDomainStore((s) => s.pendingAction) === "artifact:create";
  const error = useWorkspaceDomainStore((s) => s.error);
  return (
    <Shell kind="artifact">
      {(close) => (
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            try {
              await create({
                name: String(d.get("name")),
                type: String(d.get("type")),
                description: String(d.get("description")) || undefined,
                source: String(d.get("source")) || undefined,
                contentRef: String(d.get("contentRef")) || undefined,
              });
              close();
            } catch {
              /* Erreur affichée. */
            }
          }}
          className="grid gap-3"
        >
          <Input name="name" required placeholder="Nom" />
          <select
            name="type"
            className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
          >
            {[
              "FILE",
              "NOTE",
              "SPEC",
              "DIFF",
              "SCREENSHOT",
              "LOG",
              "DOCUMENT",
              "DECISION_EXPORT",
              "BUNDLE",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <textarea
            name="description"
            placeholder="Description"
            className="min-h-20 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
          />
          <Input name="source" placeholder="Source" />
          <Input name="contentRef" placeholder="Référence de contenu" />
          {error && <p className="text-[10px] text-red-300">{error}</p>}
          <LoadingButton type="submit" loading={pending}>
            Créer
          </LoadingButton>
        </form>
      )}
    </Shell>
  );
}
export function DecisionDialog() {
  const create = useWorkspaceDomainStore((s) => s.createDecision);
  const pending =
    useWorkspaceDomainStore((s) => s.pendingAction) === "decision:create";
  const error = useWorkspaceDomainStore((s) => s.error);
  return (
    <Shell kind="decision">
      {(close) => (
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            try {
              await create({
                subject: String(d.get("subject")),
                context: String(d.get("context")) || undefined,
                decision: String(d.get("decision")),
                optionsConsidered: String(d.get("options"))
                  .split("\n")
                  .filter(Boolean),
                references: String(d.get("references"))
                  .split("\n")
                  .filter(Boolean),
                confidence: Number(d.get("confidence")),
              });
              close();
            } catch {
              /* Erreur affichée. */
            }
          }}
          className="grid gap-3"
        >
          <Input name="subject" required placeholder="Sujet" />
          <textarea
            name="context"
            placeholder="Contexte"
            className="min-h-16 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
          />
          <textarea
            name="options"
            placeholder="Une option par ligne"
            className="min-h-20 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
          />
          <textarea
            name="decision"
            required
            placeholder="Décision retenue"
            className="min-h-20 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
          />
          <textarea name="references" placeholder="Une référence par ligne" className="min-h-16 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"/>
          <label className="grid gap-2 text-xs">
            Confiance (0–1)
            <Input
              name="confidence"
              type="number"
              min="0"
              max="1"
              step="0.1"
              defaultValue="0.8"
            />
          </label>
          {error && <p className="text-[10px] text-red-300">{error}</p>}
          <LoadingButton type="submit" loading={pending}>
            Consigner
          </LoadingButton>
        </form>
      )}
    </Shell>
  );
}
export function NotificationDialog() {
  const send = useWorkspaceDomainStore((s) => s.sendNotification);
  const pending =
    useWorkspaceDomainStore((s) => s.pendingAction) === "notification:send";
  const error = useWorkspaceDomainStore((s) => s.error);
  return (
    <Shell kind="notification">
      {(close) => (
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            try {
              await send({
                kind: String(d.get("kind")),
                scope: String(d.get("scope")),
                title: String(d.get("title")) || undefined,
                body: String(d.get("body")),
                taskId: String(d.get("taskId")) || undefined,
                linkedEventId: String(d.get("linkedEventId")) || undefined,
                recipients: String(d.get("scope")) === "DIRECT" && String(d.get("recipientId")) ? [{type:String(d.get("recipientType")),id:String(d.get("recipientId"))}] : undefined,
              });
              close();
            } catch {
              /* Erreur affichée. */
            }
          }}
          className="grid gap-3"
        >
          <Input name="title" placeholder="Titre" />
          <select
            name="kind"
            className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
          >
            <option value="SYSTEM_ALERT">Alerte système</option>
            <option value="CHAT_MESSAGE">Message</option>
          </select>
          <select name="scope" defaultValue="BROADCAST" className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"><option value="BROADCAST">Diffusion workspace</option><option value="DIRECT">Destinataire direct</option></select>
          <div className="grid grid-cols-[.45fr_1fr] gap-2"><select name="recipientType" className="h-9 rounded-lg border border-white/10 bg-[#191715] px-2 text-xs"><option value="HUMAN">Humain</option><option value="AGENT">Agent</option></select><Input name="recipientId" placeholder="ID destinataire (si direct)"/></div>
          <Input name="taskId" placeholder="ID tâche liée (facultatif)"/>
          <Input name="linkedEventId" placeholder="ID événement lié (facultatif)"/>
          <textarea
            name="body"
            required
            placeholder="Message"
            className="min-h-28 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
          />
          {error && <p className="text-[10px] text-red-300">{error}</p>}
          <LoadingButton type="submit" loading={pending}>
            Envoyer à tous
          </LoadingButton>
        </form>
      )}
    </Shell>
  );
}
