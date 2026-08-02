"use client";

import { useState } from "react";
import { CheckCircle2, CircleHelp, Clock3, MessageSquareReply } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function QuestionsPanel() {
  const { questions, agents } = useWorkspaceDomainStore();
  const [filter, setFilter] = useState<"OPEN" | "ANSWERED" | "ARCHIVE">("OPEN");
  const visible = questions.filter((question) =>
    filter === "ARCHIVE"
      ? ["ACKNOWLEDGED", "CLOSED"].includes(question.status)
      : question.status === filter,
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/[.055] bg-white/[.018] p-1.5">
        <Button size="sm" variant={filter === "OPEN" ? "secondary" : "ghost"} onClick={() => setFilter("OPEN")}>
          <CircleHelp /> Ouvertes
          <Badge variant="outline">{questions.filter((item) => item.status === "OPEN").length}</Badge>
        </Button>
        <Button size="sm" variant={filter === "ANSWERED" ? "secondary" : "ghost"} onClick={() => setFilter("ANSWERED")}>
          <MessageSquareReply /> Répondues
          <Badge variant="outline">{questions.filter((item) => item.status === "ANSWERED").length}</Badge>
        </Button>
        <Button size="sm" variant={filter === "ARCHIVE" ? "secondary" : "ghost"} onClick={() => setFilter("ARCHIVE")}>
          <CheckCircle2 /> Traitées
        </Button>
      </div>
      {visible.map((question) => {
        const asker = agents.find((agent) => agent.id === question.askerAgentId);
        const manager = agents.find((agent) => agent.id === question.managerAgentId);
        return (
          <Card key={question.id} className="border-white/[.075] bg-white/[.018]">
            <CardContent className="grid gap-3 p-4">
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
                  {question.blocking && <Badge variant="outline">Bloquante</Badge>}
                  <Badge variant="outline">{question.status}</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
                <p className="text-[11px] text-foreground">{question.question}</p>
                <p className="mt-2 whitespace-pre-wrap text-[9px] leading-4 text-muted-foreground">{question.context}</p>
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
      {!visible.length && (
        <Card className="border-dashed"><CardContent className="grid min-h-40 place-items-center text-[10px] text-muted-foreground">Aucune question dans cette catégorie.</CardContent></Card>
      )}
    </div>
  );
}
