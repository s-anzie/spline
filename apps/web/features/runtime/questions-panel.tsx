"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleHelp, Clock3, MessageSquareReply, Sparkles, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function QuestionsPanel() {
  const {
    questions,
    agents,
    notifications,
    pendingAction,
    answerHumanQuestion,
  } = useWorkspaceDomainStore();
  const [filter, setFilter] = useState<"OPEN" | "ANSWERED" | "ARCHIVE">("OPEN");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const humanQuestions = notifications.filter(
    (notification) =>
      notification.payload["collaborationType"] === "MANAGER_HUMAN_QUESTION",
  );
  const openHumanQuestions = humanQuestions.filter(
    (notification) => typeof notification.payload["humanAnswer"] !== "string",
  );
  const visibleHumanQuestions = humanQuestions.filter((notification) =>
    filter === "OPEN"
      ? typeof notification.payload["humanAnswer"] !== "string"
      : filter === "ARCHIVE"
        ? typeof notification.payload["humanAnswer"] === "string"
        : false,
  );
  const visible = questions.filter((question) =>
    filter === "ARCHIVE"
      ? ["ACKNOWLEDGED", "CLOSED"].includes(question.status)
      : question.status === filter,
  );

  return (
    <div className="grid w-full max-w-4xl content-start gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/[.07] bg-background/95 p-1.5 shadow-sm backdrop-blur-xl">
        <Button size="sm" variant={filter === "OPEN" ? "secondary" : "ghost"} onClick={() => setFilter("OPEN")}>
          <CircleHelp /> Ouvertes
          <Badge variant="outline">{questions.filter((item) => item.status === "OPEN").length + openHumanQuestions.length}</Badge>
        </Button>
        <Button size="sm" variant={filter === "ANSWERED" ? "secondary" : "ghost"} onClick={() => setFilter("ANSWERED")}>
          <MessageSquareReply /> Répondues
          <Badge variant="outline">{questions.filter((item) => item.status === "ANSWERED").length}</Badge>
        </Button>
        <Button size="sm" variant={filter === "ARCHIVE" ? "secondary" : "ghost"} onClick={() => setFilter("ARCHIVE")}>
          <CheckCircle2 /> Traitées
        </Button>
      </div>
      {visibleHumanQuestions.map((notification) => {
        const payload = notification.payload;
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
        const humanAnswer =
          typeof payload["humanAnswer"] === "string"
            ? payload["humanAnswer"]
            : null;
        const manager = agents.find(
          (agent) => agent.id === notification.createdBy.id,
        );
        const selection = selections[notification.id] ?? "";
        const customAnswer = answers[notification.id] ?? "";
        const submittedAnswer = selection === "__OTHER__" ? customAnswer.trim() : selection;
        return (
          <Card
            key={notification.id}
            className="mx-1 overflow-hidden border-[#f47b64]/20 bg-[#f47b64]/[.018]"
          >
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[.06] bg-black/10 px-4 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-[#f47b64]/10"><UserRound className="size-3.5 text-[#f47b64]" /></span>
                    <div><strong className="block text-[10px]">Décision demandée par {manager?.displayName ?? "le manager"}</strong><p className="mt-0.5 flex items-center gap-1 text-[8px] text-muted-foreground"><Clock3 className="size-3" /> {new Date(notification.createdAt).toLocaleString("fr-FR")}</p></div>
                  </div>
                </div>
                <Badge className={humanAnswer ? "border-emerald-400/20 text-emerald-300" : "border-[#f47b64]/25 text-[#f47b64]"} variant="outline">{humanAnswer ? "TRAITÉE" : "RÉPONSE REQUISE"}</Badge>
              </div>
              <div className="grid gap-3 p-3.5 sm:p-4">
                <section>
                  <p className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#f47b64]">Question à trancher</p>
                  <h2 className="mt-1.5 max-w-3xl text-[13px] font-medium leading-5 text-foreground">{notification.body}</h2>
                  {context && <details className="mt-2 rounded-lg border border-white/[.055] bg-black/10 px-3 py-1.5"><summary className="cursor-pointer text-[8px] text-muted-foreground">Afficher le contexte</summary><p className="mt-1.5 whitespace-pre-wrap border-t border-white/[.05] pt-1.5 text-[9px] leading-4 text-muted-foreground">{context}</p></details>}
                </section>
                {recommendation && (
                  <button type="button" disabled={Boolean(humanAnswer)} onClick={() => setSelections((current) => ({ ...current, [notification.id]: recommendation }))} className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition ${selection === recommendation ? "border-[#f47b64]/45 bg-[#f47b64]/[.09]" : "border-[#f47b64]/15 bg-[#f47b64]/[.035] hover:border-[#f47b64]/30"}`}>
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#f47b64]"/><span className="min-w-0"><span className="block text-[7px] font-semibold uppercase tracking-wider text-[#f47b64]">Choix recommandé par le manager</span><span className="mt-0.5 block text-[9px] leading-4">{recommendation}</span></span>{selection === recommendation && <Check className="ml-auto size-3.5 shrink-0 text-[#f47b64]"/>}
                  </button>
                )}
                {(options.length > 0 || !humanAnswer) && (
                  <section>
                    <p className="mb-2 text-[8px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Choisir une proposition</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.map((option, index) => (
                        <button key={option} type="button" disabled={Boolean(humanAnswer)} onClick={() => setSelections((current) => ({ ...current, [notification.id]: option }))} className={`grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-2.5 text-left transition ${selection === option ? "border-[#f47b64]/45 bg-[#f47b64]/[.075]" : "border-white/[.07] bg-white/[.012] hover:border-white/[.14] hover:bg-white/[.025]"}`}><span className="grid size-4.5 place-items-center rounded-full border border-white/10 text-[7px] text-muted-foreground">{index + 1}</span><span className="text-[9px] leading-4">{option}</span>{selection === option && <Check className="size-3.5 text-[#f47b64]"/>}</button>
                      ))}
                      <button type="button" disabled={Boolean(humanAnswer)} onClick={() => setSelections((current) => ({ ...current, [notification.id]: "__OTHER__" }))} className={`grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-2.5 text-left transition ${selection === "__OTHER__" ? "border-[#f47b64]/45 bg-[#f47b64]/[.075]" : "border-white/[.07] bg-white/[.012] hover:border-white/[.14] hover:bg-white/[.025]"}`}><span className="grid size-4.5 place-items-center rounded-full border border-white/10 text-[7px] text-muted-foreground">{options.length + 1}</span><span><span className="block text-[9px] leading-4">Autre réponse</span><span className="block text-[7px] text-muted-foreground">Rédiger manuellement</span></span>{selection === "__OTHER__" && <Check className="size-3.5 text-[#f47b64]"/>}</button>
                    </div>
                  </section>
                )}
                {humanAnswer ? (
                  <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[.04] p-3">
                  <p className="text-[8px] uppercase tracking-wider text-emerald-300">Votre décision</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[10px]">{humanAnswer}</p>
                  </div>
                ) : (
                  <div className="grid gap-2 border-t border-white/[.06] pt-3">
                  {selection === "__OTHER__" && <><label className="text-[8px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Votre réponse personnalisée</label><Textarea
                    value={customAnswer}
                    onChange={(event) => setAnswers((current) => ({ ...current, [notification.id]: event.target.value }))}
                    placeholder="Rédigez la décision à transmettre au manager…"
                    className="min-h-16 resize-y text-[10px]"
                    autoFocus
                  /></>}
                  {!selection && <p className="text-[9px] text-muted-foreground">Sélectionnez une proposition pour continuer.</p>}
                  <LoadingButton
                    loading={pendingAction === `question:${notification.id}:answer`}
                    disabled={!submittedAnswer}
                    onClick={() => void answerHumanQuestion(notification.id, submittedAnswer)}
                    className="justify-self-end"
                    size="sm"
                  >
                    Envoyer la décision au manager
                  </LoadingButton>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {visible.map((question) => {
        const asker = agents.find((agent) => agent.id === question.askerAgentId);
        const manager = agents.find((agent) => agent.id === question.managerAgentId);
        return (
          <Card key={question.id} className="border-white/[.075] bg-white/[.012]">
            <CardContent className="grid gap-3 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-xs">{asker?.displayName ?? question.askerAgentId}</strong>
                    <span className="text-[9px] text-muted-foreground">→ {manager?.displayName ?? "Manager"}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[8px] text-muted-foreground">
                    <Clock3 className="size-3" /> {new Date(question.createdAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex gap-1">
                  {question.blocking && <Badge className="border-amber-400/25 text-amber-300" variant="outline"><AlertTriangle/>Bloquante</Badge>}
                  <Badge variant="outline">{question.status}</Badge>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-medium leading-5 text-foreground">{question.question}</p>
                {question.context && <details className="mt-2"><summary className="cursor-pointer text-[8px] text-muted-foreground">Voir le contexte</summary><p className="mt-2 whitespace-pre-wrap text-[9px] leading-4 text-muted-foreground">{question.context}</p></details>}
              </div>
              {(question.options.length > 0 || question.recommendation) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {question.options.length > 0 && (
                    <div className="rounded-lg border border-white/[.05] p-2.5">
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Options</p>
                      <ul className="mt-1.5 list-inside list-disc text-[9px]">
                        {question.options.map((option) => <li key={option}>{option}</li>)}
                      </ul>
                    </div>
                  )}
                  {question.recommendation && (
                    <div className="rounded-lg border border-[#f47b64]/15 bg-[#f47b64]/[.035] p-2.5">
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Recommandation</p>
                      <p className="mt-1.5 text-[9px]">{question.recommendation}</p>
                    </div>
                  )}
                </div>
              )}
              {question.answer && (
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[.04] p-3">
                  <p className="text-[8px] uppercase tracking-wider text-emerald-300">Réponse du manager</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[10px]">{question.answer}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {!visible.length && !visibleHumanQuestions.length && (
        <Card className="border-dashed"><CardContent className="grid min-h-40 place-items-center text-[10px] text-muted-foreground">Aucune question dans cette catégorie.</CardContent></Card>
      )}
    </div>
  );
}
