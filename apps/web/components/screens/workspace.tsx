"use client";

import { useState } from "react";
import {
  Activity as ActivityIcon,
  Bot,
  CircleAlert,
  Clock,
  Gauge,
  GitBranch,
  KeyRound,
  Lock,
  Scale,
  ScrollText,
  Unlock,
  UserRound,
  Users,
} from "lucide-react";

import { api } from "@/lib/api";
import { duration, humanise, since, stamp } from "@/lib/format";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Id,
  Loading,
  Note,
  PageHeader,
  Panel,
  Payload,
  Row,
  Section,
  Segmented,
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";

type Tab = "health" | "schedule" | "people" | "locks" | "decisions" | "governance";

const TABS: { value: Tab; label: string }[] = [
  { value: "health", label: "Health" },
  { value: "schedule", label: "Schedule" },
  { value: "people", label: "People & agents" },
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
                  <span className="text-muted-foreground flex-1 text-sm">
                    {signal.reason || "nothing to report"}
                  </span>
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
  const go = useSession((state) => state.go);
  const schedule = useResource(() => api.schedule.get(workspaceId), [workspaceId], {
    pollMs: 20_000,
  });

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
          <Panel>
            {schedule.data.ready.map((entry) => (
              <Row key={entry.taskId} onOpen={() => go("tasks", entry.taskId)}>
                <Stripe tone="waiting" />
                <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
                <span className="label w-16 text-right">{humanise(entry.priority)}</span>
                <span
                  className={`measure w-28 text-right text-xs ${
                    entry.unblocks > 0 ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  unblocks {entry.unblocks}
                </span>
              </Row>
            ))}
          </Panel>
        ) : (
          <Empty icon={ScrollText}>
            Nothing is ready. Everything is running, waiting, or done.
          </Empty>
        )}
      </Section>

      <Section title="Waiting on something" count={schedule.data.waiting.length}>
        {schedule.data.waiting.length > 0 ? (
          <Panel>
            {schedule.data.waiting.map((entry) => (
              <Row key={entry.taskId} onOpen={() => go("tasks", entry.taskId)}>
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
        ) : (
          <Empty icon={ScrollText}>Nothing is waiting on anything else.</Empty>
        )}
      </Section>
    </>
  );
}

function People({ workspaceId }: { workspaceId: string }) {
  const members = useResource(() => api.members(workspaceId), [workspaceId]);

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

      <Section title="Members" count={all.length}>
        <Panel>
          {all.map((member) => (
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
              <span className="label w-40 text-right">{humanise(member.role)}</span>
              <span className="measure text-muted-foreground w-20 text-right text-xs">
                {since(member.joinedAt)}
              </span>
            </Row>
          ))}
        </Panel>
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

  if (locks.loading) return <Loading rows={2} />;
  if (locks.error) return <Note>{locks.error}</Note>;

  const held = (locks.data ?? []).filter((lock) => lock.active);
  const past = (locks.data ?? []).filter((lock) => !lock.active);

  return (
    <>
      {error ? (
        <div className="mb-4">
          <Note>{error}</Note>
        </div>
      ) : null}

      <Section title="Held right now" count={held.length}>
        {held.length > 0 ? (
          <Panel>
            {held.map((lock) => (
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
                <span className="measure text-muted-foreground w-32 text-right text-xs">
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
        ) : (
          <Empty icon={Unlock} title="No resource is locked">
            Nothing is being held exclusively right now.
          </Empty>
        )}
      </Section>

      {past.length > 0 ? (
        <Section title="Released or expired" count={past.length}>
          <Panel>
            {past.slice(0, 20).map((lock) => (
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
        </Section>
      ) : null}
    </>
  );
}

/** The record of what was chosen, what was turned down, and why. */
function Decisions({ workspaceId }: { workspaceId: string }) {
  const decisions = useResource(() => api.decisions(workspaceId), [workspaceId]);

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
    <Panel>
      {decisions.data.map((decision) => (
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
  );
}

/** The rules, and the named secrets agents may be run with. Never a value. */
function Governance({ workspaceId }: { workspaceId: string }) {
  const policies = useResource(() => api.policies(workspaceId), [workspaceId]);
  const secrets = useResource(() => api.secrets(workspaceId), [workspaceId]);

  return (
    <>
      <Section title="Policies" count={policies.data?.length}>
        {policies.loading ? <Loading rows={2} /> : null}
        {policies.error ? <Note>{policies.error}</Note> : null}
        {policies.data?.length ? (
          <Panel>
            {policies.data.map((policy) => (
              <div key={policy.id} className="flex items-stretch gap-3 px-4 py-3">
                <Stripe tone={policy.enabled ? "settled" : "quiet"} />
                <Scale className="text-muted-foreground size-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-sm font-medium">{humanise(policy.type)}</span>
                    <span className="measure text-muted-foreground text-xs">
                      {policy.rule}
                    </span>
                    <span className="label flex-1 text-right">
                      {humanise(policy.scope.type)}
                    </span>
                  </div>
                  <Payload value={policy.value} />
                </div>
                <Status value={policy.enabled ? "ACTIVE" : "DISABLED"} />
              </div>
            ))}
          </Panel>
        ) : policies.data ? (
          <Empty icon={Scale} title="No policy is set">
            The workspace runs on the hub&apos;s defaults.
          </Empty>
        ) : null}
      </Section>

      <Section title="Secrets" count={secrets.data?.length}>
        {secrets.error ? <Note>{secrets.error}</Note> : null}
        {secrets.data?.length ? (
          <Panel>
            {secrets.data.map((secret) => (
              <Row key={secret.name}>
                {/* A secret nothing has ever read is either new or dead. */}
                <Stripe tone={secret.lastAccessedAt ? "settled" : "quiet"} />
                <KeyRound className="text-muted-foreground size-3.5 shrink-0" />
                <span className="measure flex-1 text-sm">{secret.name}</span>
                <span className="text-muted-foreground text-xs">
                  {secret.lastAccessedAt
                    ? `last used ${since(secret.lastAccessedAt)}`
                    : "never used"}
                </span>
                <span className="measure text-muted-foreground w-28 text-right text-xs">
                  added {stamp(secret.createdAt).slice(0, 10)}
                </span>
              </Row>
            ))}
          </Panel>
        ) : secrets.data ? (
          <Empty icon={KeyRound} title="No secret stored">
            Values are never shown here — only the names, and when each was last
            read.
          </Empty>
        ) : null}
      </Section>
    </>
  );
}
