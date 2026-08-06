"use client";

import Link from "next/link";
import { CircleCheckBig, CornerDownRight, Target } from "lucide-react";

import { api, type GoalView } from "@/lib/api";
import { humanise, since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  BackTo,
  Empty,
  Facts,
  Id,
  Loading,
  Meter,
  Note,
  PageHeader,
  Pager,
  Panel,
  Row,
  Section,
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AddButton, NewGoal, NewTask } from "@/components/forms";

export function GoalList() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const goals = useResource(() => api.goals.list(workspaceId), [workspaceId], {
    pollMs: 30_000,
  });

  const all = goals.data ?? [];
  /**
   * Children are shown under their parent, indented once. Deeper nesting is
   * flattened deliberately: a tree four levels deep is a tree nobody reads,
   * and the parent is always one click away on the detail.
   */
  const roots = all.filter((goal) => !goal.parentGoalId);
  const childrenOf = (id: string) => all.filter((goal) => goal.parentGoalId === id);
  const orphans = all.filter(
    (goal) => goal.parentGoalId && !all.some((other) => other.id === goal.parentGoalId),
  );
  // Paged over the top level: a parent and its children are one entry to
  // read, so splitting a family across two pages would be worse than useless.
  const paged = usePaged([...roots, ...orphans]);

  const active = all.filter((goal) => goal.status === "ACTIVE").length;
  const done = all.filter((goal) => goal.status === "COMPLETED").length;
  const progress = all.length
    ? Math.round(all.reduce((sum, goal) => sum + goal.progress, 0) / all.length)
    : 0;

  return (
    <>
      <PageHeader
        title="Goals"
        lead="What this workspace is for, and how far along it is. Progress is computed from the tasks underneath — it is never typed in by hand."
        actions={<NewGoal trigger={<AddButton>State a need</AddButton>} />}
      />

      <StatRow>
        <Stat label="Goals" value={all.length} icon={Target} />
        <Stat label="Active" value={active} icon={Target} tone="live" hint="being worked on" />
        <Stat
          label="Complete"
          value={done}
          icon={CircleCheckBig}
          tone="settled"
          hint="approved by a person"
        />
        <Stat
          label="Average progress"
          value={`${progress}%`}
          icon={Target}
          tone={progress >= 100 ? "settled" : "live"}
          hint="computed from tasks"
        />
      </StatRow>

      {goals.loading ? <Loading rows={4} /> : null}
      {goals.error ? <Note>{goals.error}</Note> : null}
      {goals.data && all.length === 0 ? (
        <Empty icon={Target} title="Nothing has been asked for yet">
          A goal is where a need enters the system: say what you want and how
          anyone will know it happened. Breaking it into tasks comes after.
        </Empty>
      ) : null}

      {all.length > 0 ? (
        <>
        <Panel>
          {paged.items.map((goal) => (
            <div key={goal.id} className="divide-border divide-y">
              <GoalRow goal={goal} />
              {childrenOf(goal.id).map((child) => (
                <GoalRow key={child.id} goal={child} indented />
              ))}
            </div>
          ))}
        </Panel>
        <Pager paged={paged} />
        </>
      ) : null}
    </>
  );
}

function GoalRow({ goal, indented = false }: { goal: GoalView; indented?: boolean }) {
  return (
    <Row href={routes.goal(goal.id)} className={indented ? "pl-10" : undefined}>
      {indented ? (
        <CornerDownRight className="text-muted-foreground size-3.5 shrink-0" />
      ) : (
        <Stripe tone={toneOf(goal.status)} />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{goal.title}</span>
      <Meter value={goal.progress} />
      <span className="label hidden w-16 shrink-0 text-right md:block">
        {humanise(goal.priority)}
      </span>
      <Status value={goal.status} />
      <span className="measure text-muted-foreground w-16 shrink-0 text-right text-xs">
        {since(goal.updatedAt)}
      </span>
    </Row>
  );
}

export function GoalDetail({ goalId }: { goalId: string }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const goal = useResource(() => api.goals.get(workspaceId, goalId), [workspaceId, goalId]);
  const tasks = useResource(
    () => api.tasks.list(workspaceId, { goalId }),
    [workspaceId, goalId],
  );
  const members = useResource(() => api.members.list(workspaceId), [workspaceId]);
  const { run: act, pending, error } = useAction();

  if (goal.loading) return <Loading rows={4} />;
  if (goal.error || !goal.data) return <Note>{goal.error ?? "Not found"}</Note>;
  const view = goal.data;

  const reload = () => {
    goal.reload();
    tasks.reload();
  };

  return (
    <>
      <BackTo label="Goals" href={routes.goals} />
      <PageHeader
        title={view.title}
        lead={view.description ?? undefined}
        actions={<Status value={view.status} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Meter value={view.progress} />
        <span className="bg-border h-4 w-px" />
        {view.allowedStatusTargets.map((target) => (
          <Button
            key={target}
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              void act(() => api.goals.setStatus(workspaceId, view.id, target), reload)
            }
          >
            {humanise(target)}
          </Button>
        ))}
        {/* §10.9 — closing a goal is an approval a human holds, not a status
            pick. The hub enforces it; the button says so by naming it. */}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => void act(() => api.goals.complete(workspaceId, view.id), reload)}
        >
          <CircleCheckBig />
          Approve as done
        </Button>
      </div>
      {error ? (
        <div className="mb-6">
          <Note>{error}</Note>
        </div>
      ) : null}

      <div className="mb-7 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Section title="Success means">
          {view.successCriteria.length > 0 ? (
            <Card className="gap-0 p-5 shadow-none">
              <ol className="space-y-2.5">
                {view.successCriteria.map((criterion, index) => (
                  <li key={index} className="flex gap-3 text-sm leading-relaxed">
                    <span className="measure text-muted-foreground pt-0.5 text-xs">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : (
            <Empty icon={Target} title="No success criteria">
              Nothing says when this goal is finished, so nobody can approve it
              with confidence.
            </Empty>
          )}
        </Section>

        <Card className="h-fit gap-0 p-4 shadow-none">
          <Facts
            items={[
              ["id", <Id key="id" value={view.id} />],
              ["owner", `${view.owner.type.toLowerCase()} ${view.owner.id.slice(0, 8)}`],
              ["priority", humanise(view.priority)],
              [
                "parent",
                view.parentGoalId ? (
                  <Link
                    href={routes.goal(view.parentGoalId)}
                    className="underline underline-offset-2"
                  >
                    {view.parentGoalId.slice(0, 8)}
                  </Link>
                ) : (
                  "root goal"
                ),
              ],
              [
                "waits on",
                view.dependsOnGoalIds.length
                  ? view.dependsOnGoalIds.map((id) => id.slice(0, 8)).join(", ")
                  : "nothing",
              ],
              ["created", stamp(view.createdAt).slice(0, 16)],
            ]}
          />
        </Card>
      </div>

      <Section
        title="Tasks"
        count={tasks.data?.length}
        actions={
          <NewTask
            goal={view}
            members={members.data ?? []}
            onDone={reload}
            trigger={<AddButton>New task</AddButton>}
          />
        }
      >
        {tasks.data && tasks.data.length > 0 ? (
          <Panel>
            {tasks.data.map((task) => (
              <Row key={task.id} href={routes.task(task.id)}>
                <Stripe tone={toneOf(task.status)} live={task.status === "RUNNING"} />
                <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                <Status value={task.status} />
              </Row>
            ))}
          </Panel>
        ) : (
          <Empty icon={Target} title="No tasks under this goal">
            Nothing happens until this need is broken into tasks — and its
            progress stays at zero, because the number is computed from them.
          </Empty>
        )}
      </Section>
    </>
  );
}
