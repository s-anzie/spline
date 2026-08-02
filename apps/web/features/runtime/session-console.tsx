"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, Send, Terminal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentSession } from "@/lib/api/types";
import { useSessionOutputStore } from "@/stores/session-output-store";

export function SessionConsole({
  workspaceId,
  sessionId,
  agentName,
  status,
  turns,
  canReply,
  disabledHint,
  sending,
  onSend,
  onClose,
}: {
  workspaceId: string;
  sessionId: string;
  agentName: string;
  status: string;
  turns: AgentSession[];
  canReply: boolean;
  disabledHint?: string;
  sending: boolean;
  onSend: (instruction: string) => Promise<void>;
  onClose: () => void;
}) {
  const isWorking = status === "STARTING" || status === "RUNNING";
  const [message, setMessage] = useState("");
  const bySession = useSessionOutputStore((state) => state.bySession);
  const loading = useSessionOutputStore(
    (state) => state.loadingSessionId === sessionId,
  );
  const error = useSessionOutputStore((state) => state.error);
  const load = useSessionOutputStore((state) => state.load);
  const viewport = useRef<HTMLDivElement>(null);
  const shouldFollowOutput = useRef(true);
  const conversation = useMemo(() => {
    const messages: Array<{ id: string; author: "user" | "agent"; stream: "stdout" | "stderr"; text: string }> = [];
    for (const turn of turns) {
      if (turn.instruction)
        messages.push({ id: `instruction-${turn.id}`, author: "user", stream: "stdout", text: turn.instruction });
      const raw = (bySession[turn.id] ?? []).map((output) => output.content).join("");
      for (const [index, line] of raw.split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as {
          type?: string;
          message?: string | { content?: Array<{ type?: string; text?: string }> };
          item?: { type?: string; text?: string };
          error?: { message?: string };
        };
        const codexText = event.item?.type === "agent_message" ? event.item.text : undefined;
        const claudeText =
          typeof event.message === "object"
            ? event.message.content
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
          });
          continue;
        }
        const text = codexText || claudeText || errorText;
        if (text && !messages.some((item) => item.text === text))
          messages.push({ id: `event-${turn.id}-${index}`, author: "agent", stream: errorText ? "stderr" : "stdout", text });
      } catch {
        if (line.startsWith("[runtime]"))
          messages.push({ id: `runtime-${turn.id}-${index}`, author: "agent", stream: "stdout", text: line });
      }
      }
    }
    return messages;
  }, [bySession, turns]);

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
    await onSend(next);
    setMessage("");
  }

  return (
    <aside className="animate-in fade-in slide-in-from-right-3 overflow-hidden rounded-xl border border-white/[.08] bg-[#11100f] xl:sticky xl:top-5 xl:flex xl:h-[calc(100vh-10rem)] xl:flex-col">
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
              item.author === "user"
                ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#f47b64] px-3.5 py-2.5 text-[#241614] shadow-lg shadow-[#f47b64]/5"
                : `max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 ${item.stream === "stderr" ? "border-red-400/15 bg-red-400/[.06] text-red-200" : "border-white/[.07] bg-white/[.035] text-[#d2cec8]"}`
            }
          >
            <p className={`mb-1 text-[8px] font-semibold uppercase tracking-wider ${item.author === "user" ? "opacity-60" : "text-muted-foreground"}`}>
              {item.author === "user" ? "Vous" : agentName}
            </p>
            <p className="whitespace-pre-wrap">{item.text}</p>
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
      <form onSubmit={submit} className="border-t border-white/[.07] bg-[#151311] p-3">
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
          Les collaborateurs passent par ce manager ; ils ne dialoguent pas directement avec vous.
        </p>
      </form>
    </aside>
  );
}
