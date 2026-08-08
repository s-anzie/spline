"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";

import { api } from "@/lib/api";
import { useSession } from "@/lib/store";
import { useAction } from "@/lib/use-hub";
import { Field, Note } from "@/components/kit";
import { Button } from "@/components/ui/button";

/**
 * §11 — pass or send back, in one press, wherever the question is asked.
 *
 * One component rather than one per screen. The verdict is offered from the
 * queue (where somebody is told the work needs them), from a task (where they
 * went to look at it), and from the work list (where they noticed it in
 * passing) — and three copies of two buttons and the same PENDING → RUNNING →
 * settled dance is three places to drift apart. They would, too: the dance is
 * the sort of detail one copy learns and the others do not.
 *
 * Two buttons rather than a form. The verdict IS the decision, and asking
 * somebody to write a paragraph before they may say "yes" is how a queue
 * stops being cleared. A refusal takes a reason, because a refusal without one
 * leaves the agent exactly where it was.
 */
export function Verdict({
  validationId,
  onDone,
  compact = false,
}: {
  validationId: string;
  onDone: () => void;
  /** Icon-free and tighter, for a row that is already dense. */
  compact?: boolean;
}) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [refusing, setRefusing] = useState(false);
  const [why, setWhy] = useState("");
  const { run, pending, error } = useAction();

  const pronounce = (action: "SUCCEEDED" | "FAILED", output?: string) =>
    void run(async () => {
      const started = await api.validations.settle(workspaceId, validationId, "START");
      /**
       * A validation already RUNNING refuses START, and that is not a failure
       * — it is somebody having pressed first, or this very click retried.
       * Only a server fault is worth stopping for.
       */
      if (!started.ok && started.error.status >= 500) {
        return started;
      }
      return api.validations.settle(workspaceId, validationId, action, output);
    }, onDone);

  if (refusing) {
    return (
      <div className="flex flex-1 flex-wrap items-end gap-2">
        <Field
          label="Why"
          value={why}
          onChange={setWhy}
          placeholder="What is wrong with it?"
          className="max-w-md flex-1"
        />
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || !why.trim()}
          onClick={() => pronounce("FAILED", why.trim())}
        >
          {pending ? "Sending…" : "Send it back"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRefusing(false)}>
          Cancel
        </Button>
        {error ? <Note>{error}</Note> : null}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => pronounce("SUCCEEDED")}>
        {compact ? null : <CircleCheck />}
        {pending ? "Approving…" : "It passes"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRefusing(true)}>
        Send it back
      </Button>
      {error ? <Note>{error}</Note> : null}
    </div>
  );
}
