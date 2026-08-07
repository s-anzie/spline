"use client";

import { useState } from "react";
import {
  Activity as ActivityIcon,
  Bot,
  Check,
  CircleAlert,
  Clock,
  Gauge,
  GitBranch,
  KeyRound,
  Lock,
  ScrollText,
  Unlock,
  UserRound,
  Users,
} from "lucide-react";

import { api, ROLE_MEANS, WORKSPACE_ROLES } from "@/lib/api";
import { duration, humanise, since } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Id,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Row,
  Section,
  Segmented,
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Governance } from "@/components/screens/governance";
import { Repositories } from "@/components/screens/repositories";
import { AddAgentToWorkspace, InviteMember } from "@/components/forms";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab =
  | "health"
  | "schedule"
  | "people"
  | "projects"
  | "locks"
  | "decisions"
  | "governance";

const TABS: { value: Tab; label: string }[] = [
  { value: "health", label: "Health" },
  { value: "schedule", label: "Schedule" },
  { value: "people", label: "People & agents" },
  // §8.3 — a repository belongs to a workspace, beside the people who work
  // in it and the rules they work under.
  { value: "projects", label: "Projects" },
  { value: "locks", label: "Locks" },
  { value: "decisions", label: "Decisions" },
  { value: "governance", label: "Governance" },
];

export function WorkspaceScreen() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const name = useSession(
    (state) => state.workspaces.find((workspace) => workspace.id === workspaceId)?.name,
  );
  const [tab, setTab] = useState<Tab>("health");

  return (
    <>
      <PageHeader
        title={name ?? "Workspace"}
        lead="How this workspace is doing, who is in it, and the rules it runs under. Everything here is scoped to this workspace and nothing crosses between them."
      />

      <div className="mb-6">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === "health" ? <Health workspaceId={workspaceId} /> : null}
      {tab === "schedule" ? <Schedule workspaceId={workspaceId} /> : null}
      {tab === "people" ? <People workspaceId={workspaceId} /> : null}
      {tab === "projects" ? <Repositories workspaceId={workspaceId} /> : null}
      {tab === "locks" ? <Locks workspaceId={workspaceId} /> : null}
      {tab === "decisions" ? <Decisions workspaceId={workspaceId} /> : null}
      {tab === "governance" ? <Governance workspaceId={workspaceId} /> : null}
    </>
  );
}

/**
 * §17 — the workspace's own assessment, never a number this console invented.
 *
 * Each probe names what it is unhappy about and for how long, because
 * "degraded" on its own is a word, not a thing anybody can act on.
 */
function Health({ workspaceId }: { workspaceId: string }) {
  const health = useResource(() => api.health(workspaceId), [workspaceId], {
    pollMs: 20_000,
  });

  if (health.loading) return <Loading rows={3} />;
  if (health.error) return <Note>{health.error}</Note>;
  if (!health.data) return null;

  const worst = health.data.signals.filter(
    (signal) => signal.level !== "HEALTHY",
  ).length;

  return (
    <>
      <StatRow>
        <Stat
          label="Overall"
          value={humanise(health.data.level)}
          icon={ActivityIcon}
          tone={toneOf(health.data.level)}
          hint="the worst signal decides"
        />
        <Stat
          label="Degraded resources"
          value={health.data.totalDegraded}
          icon={CircleAlert}
          tone={health.data.totalDegraded ? "signal" : "settled"}
          hint={health.data.totalDegraded ? "named below" : "nothing is unhappy"}
        />
        <Stat
          label="Probes complaining"
          value={`${worst}/${health.data.signals.length}`}
          icon={Gauge}
          tone={worst ? "waiting" : "settled"}
        />
        <Stat
          label="Assessed"
          value={since(health.data.assessedAt)}
          icon={Clock}
          hint="computed at read, never cached"
        />
      </StatRow>

      <Section title="Signals" count={health.data.signals.length}>
        <Panel>
          {health.data.signals.map((signal) => (
            <div key={signal.probe} className="flex items-stretch gap-3 px-4 py-3.5">
              <Stripe tone={toneOf(signal.level)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-sm font-medium">{humanise(signal.probe)}</span>
                  {/**
                   * The reason, and NOTHING when there is none.
                   *
                   * This said "nothing to report" whenever the reason was
                   * empty — including on rows that were reporting a warning
                   * with a degraded resource named underneath. Every warning
                   * on this screen contradicted itself in the same line, and
                   * the placeholder was doing it: a probe's `reason` is often
                   * empty while its `resources` carry the finding.
                   */}
                  {signal.reason ? (
                    <span className="text-muted-foreground flex-1 text-sm">
                      {signal.reason}
                    </span>
                  ) : signal.resources.length === 0 ? (
                    <span className="text-muted-foreground flex-1 text-sm">
                      nothing to report
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <Status value={signal.level} />
                </div>
                {signal.resources.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {signal.resources.map((resource) => (
                      <li
                        key={`${resource.type}:${resource.id}`}
                        className="text-muted-foreground flex items-center gap-2 text-xs"
                      >
                        <span className="label">{humanise(resource.type)}</span>
                        <Id value={resource.id} />
                        <span className="measure">
                          degraded for {duration(resource.degradedForMs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
        </Panel>
      </Section>
    </>
  );
}

/**
 * §10.18d — what could be picked up next, in written precedence order.
 *
 * `unblocks` is the column that matters: a task holding four others is worth
 * more than a task holding none, and no score is invented to say so.
 */
function Schedule({ workspaceId }: { workspaceId: string }) {
  const schedule = useResource(() => api.schedule.get(workspaceId), [workspaceId], {
    pollMs: 20_000,
  });
  const ready = usePaged(schedule.data?.ready ?? []);
  const waiting = usePaged(schedule.data?.waiting ?? []);

  if (schedule.loading) return <Loading rows={3} />;
  if (schedule.error) return <Note>{schedule.error}</Note>;
  if (!schedule.data) return null;

  const { readyCount, waitingCount, inFlightCount, nothingToDo } = schedule.data.summary;

  return (
    <>
      <StatRow>
        <Stat
          label="Ready"
          value={readyCount}
          icon={ScrollText}
          tone={readyCount ? "waiting" : "quiet"}
          hint="could start right now"
        />
        <Stat
          label="Under way"
          value={inFlightCount}
          icon={ActivityIcon}
          tone="live"
          hint="running or being judged"
        />
        <Stat
          label="Waiting"
          value={waitingCount}
          icon={ScrollText}
          hint="held by something else"
        />
        {/* §9.16 — "nothing to do" is a claim, and it has to be made out loud.
            An empty list looks the same whether everything is finished or
            everything is stuck, so the hub says which. */}
        <Stat
          label="Anything to do"
          value={nothingToDo ? "no" : "yes"}
          icon={ScrollText}
          tone={nothingToDo ? "signal" : "settled"}
          hint={nothingToDo ? "nothing can be picked up" : "work is available"}
        />
      </StatRow>

      {schedule.data.cycles.length > 0 ? (
        <Section title="Cycles" count={schedule.data.cycles.length}>
          <Note>
            These tasks depend on each other in a loop, so none of them can ever
            become ready. Break one dependency to release the rest.
            <span className="measure mt-2 block text-xs">
              {schedule.data.cycles
                .map((cycle) => cycle.map((id) => id.slice(0, 8)).join(" → "))
                .join("   |   ")}
            </span>
          </Note>
        </Section>
      ) : null}

      <Section title="Ready to pick up" count={schedule.data.ready.length}>
        {schedule.data.ready.length > 0 ? (
          <>
          <Panel>
            {ready.items.map((entry) => (
              <Row key={entry.taskId} href={routes.task(entry.taskId)}>
                <Stripe tone="waiting" />
                <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
                <span className="label w-16 text-right">{humanise(entry.priority)}</span>
                <span
                  className={`measure shrink-0 text-right text-xs whitespace-nowrap ${
                    entry.unblocks > 0 ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  unblocks {entry.unblocks}
                </span>
              </Row>
            ))}
          </Panel>
          <Pager paged={ready} />
          </>
        ) : (
          <Empty icon={ScrollText}>
            Nothing is ready. Everything is running, waiting, or done.
          </Empty>
        )}
      </Section>

      <Section title="Waiting on something" count={schedule.data.waiting.length}>
        {schedule.data.waiting.length > 0 ? (
          <>
          <Panel>
            {waiting.items.map((entry) => (
              <Row key={entry.taskId} href={routes.task(entry.taskId)}>
                <Stripe tone="quiet" />
                <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
                {/* Held by what, and why — a list of ids would send the reader
                    off to look each one up. */}
                <span className="text-muted-foreground truncate text-xs">
                  {entry.blockedBy
                    .map((held) => `${held.reason} (${held.id.slice(0, 8)})`)
                    .join(", ")}
                </span>
              </Row>
            ))}
          </Panel>
          <Pager paged={waiting} />
          </>
        ) : (
          <Empty icon={ScrollText}>Nothing is waiting on anything else.</Empty>
        )}
      </Section>
    </>
  );
}

function People({ workspaceId }: { workspaceId: string }) {
  const members = useResource(() => api.members.list(workspaceId), [workspaceId]);
  const paged = usePaged(members.data ?? []);
  const { run, pending, error } = useAction();

  if (members.loading) return <Loading rows={3} />;
  if (members.error) return <Note>{members.error}</Note>;

  const all = members.data ?? [];
  const humans = all.filter((member) => member.actorType === "HUMAN").length;

  return (
    <>
      <StatRow>
        <Stat label="Members" value={all.length} icon={Users} />
        <Stat label="People" value={humans} icon={UserRound} tone="settled" />
        <Stat
          label="Agents"
          value={all.length - humans}
          icon={Bot}
          tone="live"
          hint="each one holds a role, like a person"
        />
        <Stat
          label="Owners"
          value={all.filter((member) => member.role === "OWNER").length}
          icon={KeyRound}
          tone="waiting"
          hint="can pair machines"
        />
      </StatRow>

      {error ? (
        <div className="mb-4">
          <Note>{error}</Note>
        </div>
      ) : null}

      <Section
        title="Members"
        count={all.length}
        actions={
          <div className="flex gap-2">
            <InviteMember onDone={members.reload} />
            {/* §18 — a workspace lends a role; it does not mint identities.
                Creating one is an organization act, and doing both here is
                what produced three agents of the same name. */}
            <AddAgentToWorkspace
              members={members.data ?? []}
              onDone={members.reload}
            />
          </div>
        }
      >
        <Panel>
          {paged.items.map((member) => (
            <Row key={member.membershipId}>
              <Stripe tone={member.actorType === "HUMAN" ? "settled" : "live"} />
              {member.actorType === "HUMAN" ? (
                <UserRound className="text-muted-foreground size-3.5 shrink-0" />
              ) : (
                <Bot className="text-muted-foreground size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">
                {member.displayName ?? member.email ?? (
                  <span className="measure">{member.actorId.slice(0, 12)}</span>
                )}
              </span>
              {/* The role is the whole authorisation story for this actor,
                  so it is editable where it is read — not two screens away. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={pending}
                    className="label hover:text-foreground w-40 text-right transition-colors"
                  >
                    {humanise(member.role)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="label">Role</DropdownMenuLabel>
                  {WORKSPACE_ROLES.map((role) => (
                    <DropdownMenuItem
                      key={role}
                      className="flex-col items-start gap-0.5"
                      onSelect={() =>
                        void run(
                          () =>
                            api.members.changeRole(
                              workspaceId,
                              member.membershipId,
                              role,
                            ),
                          members.reload,
                        )
                      }
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="flex-1">{humanise(role)}</span>
                        {member.role === role ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="text-muted-foreground text-xs leading-snug">
                        {ROLE_MEANS[role]}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-signal"
                    onSelect={() =>
                      void run(
                        () => api.members.revoke(workspaceId, member.membershipId),
                        members.reload,
                      )
                    }
                  >
                    Remove from this workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="measure text-muted-foreground w-20 text-right text-xs">
                {since(member.joinedAt)}
              </span>
            </Row>
          ))}
        </Panel>
        <Pager paged={paged} />
      </Section>
    </>
  );
}

/**
 * §13.5 — a lease, not a flag. `active` is computed against the clock at read,
 * so a lock whose holder died shows as expired without anything sweeping.
 */
function Locks({ workspaceId }: { workspaceId: string }) {
  const locks = useResource(() => api.locks(workspaceId), [workspaceId], { pollMs: 15_000 });
  const { run, pending, error } = useAction();
  const held = (locks.data ?? []).filter((lock) => lock.active);
  const past = (locks.data ?? []).filter((lock) => !lock.active);
  const pagedHeld = usePaged(held);
  const pagedPast = usePaged(past);

  if (locks.loading) return <Loading rows={2} />;
  if (locks.error) return <Note>{locks.error}</Note>;

  return (
    <>
      {error ? (
        <div className="mb-4">
          <Note>{error}</Note>
        </div>
      ) : null}

      <Section title="Held right now" count={held.length}>
        {held.length > 0 ? (
          <>
          <Panel>
            {pagedHeld.items.map((lock) => (
              <Row key={lock.id}>
                <Stripe tone="live" live />
                <Lock className="text-muted-foreground size-3.5 shrink-0" />
                <span className="flex-1 text-sm">
                  <span className="label">{humanise(lock.resource.type)}</span>{" "}
                  <span className="measure">{lock.resource.id.slice(0, 8)}</span>
                  {lock.reason ? (
                    <span className="text-muted-foreground ml-2 text-xs">{lock.reason}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {lock.owner.type.toLowerCase()}{" "}
                  <span className="measure">{lock.owner.id.slice(0, 8)}</span>
                </span>
                <span className="measure text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap">
                  expires {since(lock.expiresAt)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-signal"
                  disabled={pending}
                  onClick={() =>
                    void run(() => api.releaseLock(workspaceId, lock.id), locks.reload)
                  }
                >
                  <Unlock />
                  Force release
                </Button>
              </Row>
            ))}
          </Panel>
          <Pager paged={pagedHeld} />
          </>
        ) : (
          <Empty icon={Unlock} title="No resource is locked">
            Nothing is being held exclusively right now.
          </Empty>
        )}
      </Section>

      {past.length > 0 ? (
        <Section title="Released or expired" count={past.length}>
          <Panel>
            {pagedPast.items.map((lock) => (
              <Row key={lock.id}>
                <Stripe tone="quiet" />
                <span className="text-muted-foreground flex-1 text-sm">
                  <span className="label">{humanise(lock.resource.type)}</span>{" "}
                  <span className="measure">{lock.resource.id.slice(0, 8)}</span>
                </span>
                <Status value={lock.status} />
                <span className="measure text-muted-foreground w-20 text-right text-xs">
                  {since(lock.releasedAt ?? lock.expiresAt)}
                </span>
              </Row>
            ))}
          </Panel>
          <Pager paged={pagedPast} />
        </Section>
      ) : null}
    </>
  );
}

/** The record of what was chosen, what was turned down, and why. */
function Decisions({ workspaceId }: { workspaceId: string }) {
  const decisions = useResource(() => api.decisions(workspaceId), [workspaceId]);
  const paged = usePaged(decisions.data ?? []);

  if (decisions.loading) return <Loading rows={3} />;
  if (decisions.error) return <Note>{decisions.error}</Note>;
  if (!decisions.data?.length) {
    return (
      <Empty icon={GitBranch} title="No decision recorded">
        An agent writes here when it chooses between options — the rationale
        outlives the conversation that produced it.
      </Empty>
    );
  }

  return (
    <>
    <Panel>
      {paged.items.map((decision) => (
        <div key={decision.id} className="flex items-stretch gap-3 px-4 py-3.5">
          <Stripe tone={decision.isSuperseded ? "quiet" : "settled"} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5">
              <p className="flex-1 text-sm font-medium">{decision.subject}</p>
              <span className="label">{humanise(decision.confidence)}</span>
              <span className="measure text-muted-foreground text-xs">
                {since(decision.decidedAt)}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              <span className="text-foreground font-medium">{decision.outcome}</span> —{" "}
              {decision.rationale}
            </p>
            {decision.alternatives.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {decision.alternatives.map((alternative, index) => (
                  <li key={index} className="text-muted-foreground text-xs">
                    not {alternative.option}: {alternative.rejectedBecause}
                  </li>
                ))}
              </ul>
            ) : null}
            {decision.isSuperseded ? (
              <p className="text-signal mt-1.5 text-xs">
                superseded by {decision.supersededByDecisionId?.slice(0, 8)}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </Panel>
    <Pager paged={paged} />
    </>
  );
}
