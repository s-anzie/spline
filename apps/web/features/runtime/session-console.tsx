"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  CircleHelp,
  Download,
  FileCode2,
  LoaderCircle,
  Pencil,
  Reply,
  Send,
  Terminal,
  Wrench,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentQuestion, AgentSession, Notification } from "@/lib/api/types";
import { useSessionOutputStore } from "@/stores/session-output-store";

export function SessionConsole({
  workspaceId,
  sessionId,
  agentName,
  status,
  turns,
  questions,
  notifications,
  agentNames,
  isLatestAgentConversation,
  showComposer,
  canReply,
  disabledHint,
  sending,
  onSend,
  onEdit,
  onClose,
}: {
  workspaceId: string;
  sessionId: string;
  agentName: string;
  status: string;
  turns: AgentSession[];
  questions: AgentQuestion[];
  notifications: Notification[];
  agentNames: Record<string, string>;
  isLatestAgentConversation: boolean;
  showComposer: boolean;
  canReply: boolean;
  disabledHint?: string;
  sending: boolean;
  onSend: (instruction: string, replyToNotificationId?: string) => Promise<void>;
  onEdit: (notificationId: string, message: string) => Promise<void>;
  onClose: () => void;
}) {
  const isWorking = status === "STARTING" || status === "RUNNING";
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const bySession = useSessionOutputStore((state) => state.bySession);
  const loading = useSessionOutputStore(
    (state) => state.loadingSessionId === sessionId,
  );
  const error = useSessionOutputStore((state) => state.error);
  const load = useSessionOutputStore((state) => state.load);
  const viewport = useRef<HTMLDivElement>(null);
  const shouldFollowOutput = useRef(true);
  const conversation = useMemo(() => {
    type ConversationItem = {
      id: string;
      author: "user" | "agent" | "coordination" | "activity";
      stream: "stdout" | "stderr";
      text: string;
      label?: string;
      activityKind?: "thinking" | "tool" | "command" | "file";
      activityStatus?: "running" | "completed" | "failed";
      notificationId?: string;
      replyPreview?: string;
      editable?: boolean;
      edited?: boolean;
      occurredAt?: number;
    };
    const messages: ConversationItem[] = [];
    const upsertActivity = (item: ConversationItem) => {
      const existing = messages.findIndex((candidate) => candidate.id === item.id);
      if (existing >= 0) messages[existing] = item;
      else messages.push(item);
    };
    const compact = (value: unknown, fallback: string) => {
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
      if (value && typeof value === "object")
        return JSON.stringify(value).slice(0, 500);
      return fallback;
    };
    for (const turn of turns) {
      if (
        turn.instruction &&
        !turn.instruction.startsWith("Human decision in response to your question")
      )
        messages.push({
          id: `instruction-${turn.id}`,
          author: "user",
          stream: "stdout",
          text: turn.instruction,
          occurredAt: Date.parse(turn.startedAt),
        });
      const outputs = bySession[turn.id] ?? [];
      const outputRanges: Array<{ end: number; occurredAt: number }> = [];
      let outputEnd = 0;
      for (const output of outputs) {
        outputEnd += output.content.length;
        outputRanges.push({
          end: outputEnd,
          occurredAt: Date.parse(output.createdAt),
        });
      }
      const raw = outputs.map((output) => output.content).join("");
      let lineCursor = 0;
      for (const [index, line] of raw.split("\n").entries()) {
      const occurredAt =
        outputRanges.find((range) => lineCursor < range.end)?.occurredAt ??
        Date.parse(turn.startedAt);
      lineCursor += line.length + 1;
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as {
          type?: string;
          subtype?: string;
          message?: string | { content?: Array<{ type?: string; text?: string }> };
          item?: {
            id?: string;
            type?: string;
            text?: string;
            command?: string;
            aggregated_output?: string;
            status?: string;
            exit_code?: number;
            server?: string;
            tool?: string;
            name?: string;
            arguments?: unknown;
            changes?: unknown;
            query?: string;
            error?: string;
          };
          error?: { message?: string };
        };
        const eventMessage =
          typeof event.message === "object" ? event.message : undefined;
        const claudeParts = eventMessage?.content ?? [];
        for (const part of claudeParts as Array<{
          type?: string;
          id?: string;
          tool_use_id?: string;
          name?: string;
          input?: unknown;
          content?: unknown;
          is_error?: boolean;
        }>) {
          if (part.type === "tool_use") {
            upsertActivity({
              id: `claude-tool-${turn.id}-${part.id ?? index}`,
              author: "activity",
              stream: "stdout",
              label: part.name ?? "Outil",
              text: compact(part.input, "Exécution de l’outil"),
              activityKind:
                /read|write|edit/i.test(part.name ?? "") ? "file" :
                /bash|command/i.test(part.name ?? "") ? "command" : "tool",
              activityStatus: "running",
              occurredAt,
            });
          }
          if (part.type === "tool_result") {
            const activityId = `claude-tool-${turn.id}-${part.tool_use_id ?? index}`;
            const prior = messages.find((candidate) => candidate.id === activityId);
            upsertActivity({
              id: activityId,
              author: "activity",
              stream: part.is_error ? "stderr" : "stdout",
              label: prior?.label ?? "Résultat de l’outil",
              text: prior?.text ?? compact(part.content, "Traitement terminé"),
              activityKind: prior?.activityKind ?? "tool",
              activityStatus: part.is_error ? "failed" : "completed",
              occurredAt: prior?.occurredAt ?? occurredAt,
            });
          }
        }
        const codexItem = event.item;
        if (codexItem?.type && codexItem.type !== "agent_message") {
          const id = `codex-item-${turn.id}-${codexItem.id ?? index}`;
          const completed = event.type === "item.completed";
          const failed =
            codexItem.status === "failed" ||
            (typeof codexItem.exit_code === "number" && codexItem.exit_code !== 0) ||
            Boolean(codexItem.error);
          const metadata: Record<string, { label: string; kind: "thinking" | "tool" | "command" | "file" }> = {
            reasoning: { label: "Analyse", kind: "thinking" },
            command_execution: { label: "Commande", kind: "command" },
            mcp_tool_call: { label: codexItem.tool ? `Spline · ${codexItem.tool}` : "Outil Spline", kind: "tool" },
            file_change: { label: "Modification de fichiers", kind: "file" },
            web_search: { label: "Recherche", kind: "tool" },
          };
          const meta = metadata[codexItem.type] ?? {
            label: codexItem.name ?? codexItem.type.replaceAll("_", " "),
            kind: "tool" as const,
          };
          const prior = messages.find((candidate) => candidate.id === id);
          upsertActivity({
            id,
            author: "activity",
            stream: failed ? "stderr" : "stdout",
            label: meta.label,
            text:
              prior?.text ??
              compact(
                codexItem.command ??
                  codexItem.text ??
                  codexItem.query ??
                  codexItem.arguments ??
                  codexItem.changes,
                completed ? "Étape terminée" : "Étape en cours",
              ),
            activityKind: meta.kind,
            activityStatus: failed ? "failed" : completed ? "completed" : "running",
            occurredAt: prior?.occurredAt ?? occurredAt,
          });
        }
        const codexText = event.item?.type === "agent_message" ? event.item.text : undefined;
        const claudeText =
          eventMessage
            ? eventMessage.content
                ?.filter((part) => part.type === "text" && part.text)
                .map((part) => part.text)
                .join("\n")
            : undefined;
        const errorText =
          event.type === "error"
            ? typeof event.message === "string"
              ? event.message
              : event.error?.message
            : undefined;
        const userText =
          event.type === "spline.user_message" &&
          typeof event.message === "string"
            ? event.message
            : undefined;
        if (userText) {
          messages.push({
            id: `user-${turn.id}-${index}`,
            author: "user",
            stream: "stdout",
            text: userText,
            occurredAt,
          });
          continue;
        }
        const text = codexText || claudeText || errorText;
        if (text && !messages.some((item) => item.text === text))
          messages.push({ id: `event-${turn.id}-${index}`, author: "agent", stream: errorText ? "stderr" : "stdout", text, occurredAt });
      } catch {
        if (line.startsWith("[runtime]"))
          messages.push({ id: `runtime-${turn.id}-${index}`, author: "agent", stream: "stdout", text: line, occurredAt });
      }
      }
      const turnQuestions = questions.filter((question) => {
        if (question.sessionId === turn.id) return true;
        if (!showComposer || question.managerAgentId !== turn.agentId) return false;
        if (question.answeredAt) {
          const answeredAt = Date.parse(question.answeredAt);
          const turnStart = Date.parse(turn.startedAt);
          const turnEnd = turn.endedAt
            ? Date.parse(turn.endedAt)
            : Number.POSITIVE_INFINITY;
          return answeredAt >= turnStart && answeredAt <= turnEnd;
        }
        return (
          isLatestAgentConversation &&
          turn.id === turns[turns.length - 1]?.id &&
          question.status === "OPEN"
        );
      });
      for (const question of turnQuestions) {
        messages.push({
          id: `question-${question.id}`,
          author: "coordination",
          stream: "stdout",
          label: showComposer
            ? `Question de ${agentNames[question.askerAgentId] ?? question.askerAgentId}`
            : "Question envoyée au manager",
          text: question.question,
          occurredAt: Date.parse(question.createdAt),
        });
        if (question.answer) {
          messages.push({
            id: `answer-${question.id}`,
            author: "coordination",
            stream: "stdout",
            label: "Réponse du manager",
            text: question.answer,
            occurredAt: Date.parse(question.answeredAt ?? question.updatedAt),
          });
        }
      }
      if (showComposer) {
        const operatorMessages = notifications.filter(
          (notification) =>
            notification.payload["collaborationType"] ===
              "HUMAN_MANAGER_MESSAGE" &&
            notification.payload["sessionId"] === turn.id,
        );
        for (const operatorMessage of operatorMessages) {
          const receipt = operatorMessage.recipients?.find(
            (recipient) => recipient.recipientType === "AGENT",
          );
          const receiptLabel: Record<string, string> = {
            PENDING: "en attente",
            DELIVERED: "livré",
            SEEN: "vu",
            ACKNOWLEDGED: "acquitté",
            ACTED_ON: "traité",
            FAILED: "échec de livraison",
          };
          const replyTargetId = operatorMessage.payload["replyToNotificationId"];
          const replyTarget =
            typeof replyTargetId === "string"
              ? notifications.find((item) => item.id === replyTargetId)
              : undefined;
          messages.push({
            id: `operator-message-${operatorMessage.id}`,
            author: "user",
            stream: "stdout",
            label: `Vous · ${receiptLabel[receipt?.deliveryStatus ?? "PENDING"] ?? "transmis"}`,
            text: operatorMessage.body,
            notificationId: operatorMessage.id,
            replyPreview: replyTarget?.body,
            editable: !receipt?.readAt,
            edited: typeof operatorMessage.payload["editedAt"] === "string",
            occurredAt: Date.parse(operatorMessage.createdAt),
          });
        }
        const humanRequests = notifications.filter((notification) => {
          const payload = notification.payload;
          if (payload["collaborationType"] !== "MANAGER_HUMAN_QUESTION")
            return false;
          const questionSessionId = payload["sessionId"];
          const deliverySessionId = payload["managerDeliverySessionId"];
          const hasPendingAnswer =
            typeof payload["humanAnswer"] === "string" &&
            typeof deliverySessionId !== "string";
          return (
            questionSessionId === turn.id ||
            deliverySessionId === turn.id ||
            (hasPendingAnswer &&
              isLatestAgentConversation &&
              turn.id === turns[turns.length - 1]?.id)
          );
        });
        for (const request of humanRequests) {
          const payload = request.payload;
          if (
            payload["sessionId"] === turn.id &&
            !messages.some((message) => message.text === request.body)
          ) {
            messages.push({
              id: `human-question-${request.id}`,
              author: "coordination",
              stream: "stdout",
              label: "Question adressée à vous",
              text: request.body,
              notificationId: request.id,
              occurredAt: Date.parse(request.createdAt),
            });
          }
          const humanAnswer = payload["humanAnswer"];
          const deliverySessionId = payload["managerDeliverySessionId"];
          if (
            typeof humanAnswer === "string" &&
            (deliverySessionId === turn.id ||
              (typeof deliverySessionId !== "string" &&
                isLatestAgentConversation &&
                turn.id === turns[turns.length - 1]?.id))
          ) {
            messages.push({
              id: `human-answer-${request.id}`,
              author: "user",
              stream: "stdout",
              label: "Votre réponse",
              text: humanAnswer,
              occurredAt: Date.parse(
                typeof payload["answeredAt"] === "string"
                  ? payload["answeredAt"]
                  : request.createdAt,
              ),
            });
          }
        }
      }
    }
    return messages
      .map((item, index) => ({ item, index }))
      .sort(
        (left, right) =>
          (left.item.occurredAt ?? Number.MAX_SAFE_INTEGER) -
            (right.item.occurredAt ?? Number.MAX_SAFE_INTEGER) ||
          left.index - right.index,
      )
      .map(({ item }) => item);
  }, [agentNames, bySession, isLatestAgentConversation, notifications, questions, showComposer, turns]);

  useEffect(() => {
    for (const turn of turns) void load(workspaceId, turn.id);
    if (!["STARTING", "RUNNING", "AWAITING_APPROVAL"].includes(status))
      return;
    const refresh = window.setInterval(
      () => void load(workspaceId, sessionId),
      2500,
    );
    return () => window.clearInterval(refresh);
  }, [load, sessionId, status, turns, workspaceId]);
  useEffect(() => {
    if (viewport.current && shouldFollowOutput.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [conversation]);

  function rememberScrollPosition() {
    const element = viewport.current;
    if (!element) return;
    shouldFollowOutput.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 72;
  }

  function download() {
    const content = turns
      .flatMap((turn) => bySession[turn.id] ?? [])
      .map((output) => output.content)
      .join("");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `session-${sessionId}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = message.trim();
    if (!next || !canReply) return;
    if (editing) await onEdit(editing.id, next);
    else await onSend(next, replyTo?.id);
    setMessage("");
    setEditing(null);
    setReplyTo(null);
  }

  return (
    <aside className="animate-in fade-in slide-in-from-right-3 overflow-hidden rounded-xl border border-white/[.08] bg-[#11100f] xl:sticky xl:top-5 xl:flex xl:h-[calc(100dvh-10rem)] xl:flex-col">
      <header className="flex items-center gap-3 border-b border-white/[.07] px-4 py-3.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f47b64]/10 text-[#f47b64]">
          <Terminal className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xs font-medium">{agentName}</h2>
            <span className="size-1 rounded-full bg-emerald-400 data-[inactive=true]:bg-[#625e5a]" data-inactive={status !== "RUNNING"} />
            <span className="text-[8px] text-muted-foreground">{status}</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[8px] text-muted-foreground">
            {sessionId}
          </p>
        </div>
        {!showComposer && (
          <span className="rounded-full border border-white/[.07] px-2 py-1 text-[7px] uppercase tracking-wider text-muted-foreground">
            Lecture seule
          </span>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!turns.some((turn) => (bySession[turn.id]?.length ?? 0) > 0)}
          onClick={download}
          title="Télécharger les logs"
        >
          <Download />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          title="Fermer la console"
        >
          <X />
        </Button>
      </header>
      <div
        ref={viewport}
        onScroll={rememberScrollPosition}
        data-scroll-region="session-conversation"
        style={{ overflowAnchor: "none" }}
        className="h-[28rem] flex-1 space-y-3 overflow-auto bg-black/30 p-4 text-[11px] leading-5"
      >
        {conversation.map((item) => (
          <div
            key={item.id}
            className={
              item.author === "activity"
                ? `flex max-w-[96%] items-start gap-2.5 rounded-lg border px-3 py-2 ${item.activityStatus === "failed" ? "border-red-400/15 bg-red-400/[.04]" : "border-white/[.055] bg-white/[.018]"}`
                : item.author === "coordination"
                ? "max-w-[94%] rounded-xl border border-sky-400/15 bg-sky-400/[.045] px-3.5 py-2.5 text-sky-100"
                : item.author === "user"
                ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#f47b64] px-3.5 py-2.5 text-[#241614] shadow-lg shadow-[#f47b64]/5"
                : `max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 ${item.stream === "stderr" ? "border-red-400/15 bg-red-400/[.06] text-red-200" : "border-white/[.07] bg-white/[.035] text-[#d2cec8]"}`
            }
          >
            {item.author === "activity" && (
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${item.activityStatus === "failed" ? "bg-red-400/10 text-red-300" : "bg-[#f47b64]/10 text-[#f47b64]"}`}>
                {item.activityStatus === "running" ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : item.activityStatus === "failed" ? (
                  <XCircle className="size-3.5" />
                ) : item.activityKind === "thinking" ? (
                  <Brain className="size-3.5" />
                ) : item.activityKind === "file" ? (
                  <FileCode2 className="size-3.5" />
                ) : item.activityKind === "command" ? (
                  <Terminal className="size-3.5" />
                ) : item.activityKind === "tool" ? (
                  <Wrench className="size-3.5" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
              </span>
            )}
            <div className={item.author === "activity" ? "min-w-0 flex-1" : undefined}>
            {item.replyPreview && (
              <div className="mb-2 line-clamp-2 rounded-md border-l-2 border-current/25 bg-black/15 px-2 py-1 text-[8px] opacity-65">
                {item.replyPreview}
              </div>
            )}
            <p className={`mb-1 flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider ${item.author === "user" ? "opacity-60" : item.author === "coordination" ? "text-sky-300" : "text-muted-foreground"}`}>
              {item.author === "coordination" && <CircleHelp className="size-3"/>}
              {item.label ?? (item.author === "user" ? "Vous" : agentName)}
              {item.edited && <span className="normal-case tracking-normal opacity-60">· modifié</span>}
              {item.author === "activity" && (
                <span className={`ml-auto normal-case tracking-normal ${item.activityStatus === "running" ? "text-[#f47b64]" : item.activityStatus === "failed" ? "text-red-300" : "text-emerald-400/80"}`}>
                  {item.activityStatus === "running" ? "En cours" : item.activityStatus === "failed" ? "Échec" : "Terminé"}
                </span>
              )}
            </p>
            <p className={item.author === "activity" ? "line-clamp-3 whitespace-pre-wrap font-mono text-[9px] leading-4 text-[#aaa49e]" : "whitespace-pre-wrap"}>{item.text}</p>
            {item.notificationId && showComposer && (
              <div className="mt-1.5 flex justify-end gap-1 opacity-60 transition hover:opacity-100">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  title="Répondre à ce message"
                  onClick={() => {
                    setEditing(null);
                    setReplyTo({ id: item.notificationId!, text: item.text });
                  }}
                >
                  <Reply />
                </Button>
                {item.editable && item.author === "user" && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    title="Modifier ce message"
                    onClick={() => {
                      setReplyTo(null);
                      setEditing({ id: item.notificationId!, text: item.text });
                      setMessage(item.text);
                    }}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
            )}
            </div>
          </div>
        ))}
        {isWorking && (
          <div
            role="status"
            aria-label={`${agentName} est en cours de traitement`}
            className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md border border-white/[.07] bg-white/[.035] px-3.5 py-3"
          >
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="size-1.5 animate-bounce rounded-full bg-[#f47b64]"
                style={{ animationDelay: `${index * 140}ms` }}
              />
            ))}
            <span className="sr-only">{agentName} travaille…</span>
          </div>
        )}
        {loading && (
          <span className="animate-pulse text-muted-foreground">
            Chargement de la sortie…
          </span>
        )}
        {!loading && !conversation.length && !error && (
          <span className="text-muted-foreground">
            En attente de la première sortie…
          </span>
        )}
        {error && <span className="text-red-300">{error}</span>}
      </div>
      {showComposer && <form onSubmit={submit} className="border-t border-white/[.07] bg-[#151311] p-3">
        {(replyTo || editing) && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-white/[.07] bg-white/[.025] px-3 py-2 text-[8px] text-muted-foreground">
            <span className="min-w-0 flex-1">
              <strong className="block text-foreground/80">{editing ? "Modification du message" : "Réponse à"}</strong>
              <span className="line-clamp-1">{editing?.text ?? replyTo?.text}</span>
            </span>
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => { setEditing(null); setReplyTo(null); if (editing) setMessage(""); }}><X /></Button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-white/[.08] bg-black/20 p-1.5 transition focus-within:border-[#f47b64]/35">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!canReply || sending}
            rows={2}
            placeholder={
              canReply
                ? "Répondre ou donner une nouvelle instruction au manager…"
                : (disabledHint ?? "Le manager termine son traitement avant le prochain message…")
            }
            className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-[10px] outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!canReply || sending || !message.trim()}
            className="bg-[#f47b64] text-[#241614]"
            title="Envoyer"
          >
            <Send className={sending ? "animate-pulse" : ""} />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[8px] text-muted-foreground">
          {isWorking
            ? "Le manager travaille : votre message est ajouté à sa boîte prioritaire et sera lu à son prochain point de synchronisation."
            : "Les collaborateurs passent par ce manager ; ils ne dialoguent pas directement avec vous."}
        </p>
      </form>}
    </aside>
  );
}
