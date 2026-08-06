"use client";

import { useState } from "react";
import {
  Cpu,
  KeyRound,
  LifeBuoy,
  ListTree,
  Plug,
  Radio,
  Unplug,
} from "lucide-react";

import { api } from "@/lib/api";
import { collapse, type WaitingMachine } from "@/lib/enrolments";
import { type FleetView } from "@/lib/api";
import { humanise, since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { useOrganizationId, useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Field,
  Id,
  Loading,
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

export function Machines() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const organizationId = useOrganizationId();

  const workers = useResource(() => api.runtime.workers(workspaceId), [workspaceId], {
    pollMs: 10_000,
  });
  const sessions = useResource(() => api.runtime.sessions(workspaceId), [workspaceId], {
    pollMs: 10_000,
  });
  const commands = useResource(() => api.runtime.commands(workspaceId), [workspaceId], {
    pollMs: 10_000,
  });
  const providers = useResource(() => api.runtime.providers(), [], { pollMs: 60_000 });
  const enrolments = useResource(
    () => api.enrolments.pending(organizationId!),
    [organizationId],
    { pollMs: 10_000, enabled: Boolean(organizationId) },
  );
  // §6.3 — everything this organization owns, so a workspace with none has
  // somewhere to go other than "pair it again".
  const fleet = useResource(() => api.fleet(organizationId!), [organizationId], {
    pollMs: 20_000,
    enabled: Boolean(organizationId),
  });
  const { run: act, pending, error } = useAction();

  const reloadAll = () => {
    workers.reload();
    sessions.reload();
    commands.reload();
    enrolments.reload();
    fleet.reload();
  };

  const all = workers.data ?? [];
  const reporting = all.filter((worker) => !worker.stale).length;
  const live = (sessions.data ?? []).filter((session) => session.status === "RUNNING").length;
  const queued = (commands.data ?? []).filter(
    (command) => command.status === "PENDING" || command.status === "CLAIMED",
  ).length;
  // An expired request is not something anybody can act on: the code it is
  // waiting for stopped working, and counting it as "at the door" sends an
  // operator hunting for a code that can never be accepted.
  const asking = collapse(enrolments.data ?? []);
  const waiting = asking.filter((machine) => !machine.expired);
  const stale = asking.filter((machine) => machine.expired);
  const elsewhere = (fleet.data ?? []).filter(
    (machine) => !machine.serves.includes(workspaceId),
  );
  const pagedWorkers = usePaged(all);
  const pagedSessions = usePaged(sessions.data ?? []);
  const pagedCommands = usePaged(commands.data ?? []);

  return (
    <>
      <PageHeader
        title="Machines"
        lead="The computers that actually run agents. A machine reaches out to the hub; the hub never reaches in — which is why pairing starts on the machine and finishes here."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void act(() => api.runtime.recover(workspaceId), reloadAll)}
          >
            <LifeBuoy />
            {pending ? "Recovering…" : "Recover lost sessions"}
          </Button>
        }
      />
      {error ? (
        <div className="mb-6">
          <Note>{error}</Note>
        </div>
      ) : null}

      <StatRow>
        <Stat
          label="Reporting"
          value={`${reporting}/${all.length}`}
          icon={Radio}
          tone={all.length === 0 ? "quiet" : reporting === all.length ? "settled" : "signal"}
          hint={
            all.length === 0
              ? "no machine paired"
              : reporting === all.length
                ? "all heartbeats current"
                : "one has gone quiet"
          }
        />
        <Stat
          label="Live sessions"
          value={live}
          icon={Cpu}
          tone="live"
          hint={live ? "an agent is working" : "nothing running"}
        />
        <Stat
          label="Orders queued"
          value={queued}
          icon={ListTree}
          tone={queued ? "waiting" : "quiet"}
          hint="claimed or not yet taken"
        />
        <Stat
          label="At the door"
          value={waiting.length}
          icon={KeyRound}
          tone={waiting.length ? "waiting" : "quiet"}
          hint={
            waiting.length
              ? "needs your code"
              : stale.length
                ? `${stale.length} asked too long ago to still count`
                : "nobody waiting"
          }
        />
      </StatRow>

      <Pairing waiting={waiting} stale={stale} organizationId={organizationId} onDone={reloadAll} />

      <Attach
        machines={elsewhere}
        pending={pending}
        onAttach={(workerId) =>
          void act(() => api.runtime.attachWorker(workspaceId, workerId), reloadAll)
        }
      />

      <Section title="Paired machines" count={all.length}>
        {workers.loading ? <Loading rows={2} /> : null}
        {workers.error ? <Note>{workers.error}</Note> : null}
        {workers.data && all.length === 0 ? (
          <Empty icon={Cpu} title="No machine reports to this workspace">
            Start the worker on a computer you own — it prints a pairing code on
            its own console, and you type that code here.
          </Empty>
        ) : null}
        {all.length > 0 ? (
          <>
          <Panel>
            {pagedWorkers.items.map((worker) => (
              <div key={worker.id} className="flex items-stretch gap-3 px-4 py-3.5">
                {/* Stale beats status: a worker whose last word was "ONLINE" an
                    hour ago is not online, whatever the row says. */}
                <Stripe
                  tone={worker.stale ? "signal" : toneOf(worker.status)}
                  live={!worker.stale && worker.status === "ONLINE"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5">
                    <p className="text-sm font-medium">{worker.hostname}</p>
                    <span className="measure text-muted-foreground text-xs">
                      {worker.operatingSystem}/{worker.architecture}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    can run {worker.capabilities.join(", ") || "nothing it declared"}
                    {worker.labels.length ? ` · ${worker.labels.join(" · ")}` : ""}
                  </p>
                  <p
                    className={`mt-1 text-xs ${worker.stale ? "text-signal" : "text-muted-foreground"}`}
                  >
                    {worker.stale
                      ? `silent since ${since(worker.lastHeartbeatAt)} — it has stopped reporting`
                      : `last heartbeat ${since(worker.lastHeartbeatAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Status value={worker.stale ? "DEGRADED" : worker.status} />
                  <Id value={worker.id} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-signal"
                    disabled={pending}
                    onClick={() =>
                      void act(
                        () => api.runtime.detachWorker(workspaceId, worker.id),
                        reloadAll,
                      )
                    }
                  >
                    <Unplug />
                    Detach
                  </Button>
                </div>
              </div>
            ))}
          </Panel>
          <Pager paged={pagedWorkers} />
          </>
        ) : null}
      </Section>

      <Section title="Sessions" count={sessions.data?.length}>
        {sessions.data && sessions.data.length > 0 ? (
          <>
          <Panel>
            {pagedSessions.items.map((session) => (
              <Row key={session.id}>
                <Stripe tone={toneOf(session.status)} live={session.status === "RUNNING"} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{session.provider}</span>
                  {session.model ? (
                    <span className="measure text-muted-foreground ml-2 text-xs">
                      {session.model}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground ml-2 text-xs">
                    as {session.agent.type.toLowerCase()}{" "}
                    <span className="measure">{session.agent.id.slice(0, 8)}</span>
                  </span>
                </span>
                <span className="measure text-muted-foreground text-xs">
                  {session.taskId ? `task ${session.taskId.slice(0, 8)}` : "no task"}
                </span>
                <Status value={session.status} />
                <span className="measure text-muted-foreground w-16 text-right text-xs">
                  {since(session.endedAt ?? session.startedAt)}
                </span>
              </Row>
            ))}
          </Panel>
          <Pager paged={pagedSessions} />
          </>
        ) : (
          <Empty icon={Cpu}>No agent session has been opened on these machines.</Empty>
        )}
      </Section>

      <Section title="Command queue" count={commands.data?.length}>
        {commands.data && commands.data.length > 0 ? (
          <>
          <Panel>
            {pagedCommands.items.map((command) => (
              <Row key={command.id}>
                <Stripe tone={toneOf(command.status)} />
                <span className="flex-1 text-sm font-medium">{humanise(command.type)}</span>
                {command.failureReason ? (
                  <span className="text-signal text-xs">{command.failureReason}</span>
                ) : null}
                <span className="measure text-muted-foreground text-xs">
                  machine {command.workerId.slice(0, 8)}
                </span>
                <Status value={command.status} />
              </Row>
            ))}
          </Panel>
          <Pager paged={pagedCommands} />
          </>
        ) : (
          <Empty icon={ListTree}>
            The queue is empty — every order has been claimed and reported.
          </Empty>
        )}
      </Section>

      <Section title="Providers" count={providers.data?.length}>
        {providers.data && providers.data.length > 0 ? (
          <Panel>
            {providers.data.map((provider) => (
              <Row key={provider.id}>
                <Stripe tone={provider.effectiveAvailable ? "settled" : "signal"} />
                <Plug className="text-muted-foreground size-3.5 shrink-0" />
                <span className="w-24 shrink-0 text-sm font-medium">{provider.provider}</span>
                <span className="text-muted-foreground flex-1 truncate text-xs">
                  {provider.capabilities.join(", ") || "no capability declared"}
                </span>
                {/* §4.14 — availability is computed from the quota window at
                    read, so it can never disagree with the window itself. */}
                <span
                  className={`text-right text-xs ${
                    provider.effectiveAvailable ? "text-muted-foreground" : "text-signal"
                  }`}
                >
                  {provider.effectiveAvailable
                    ? "available"
                    : provider.quotaUnavailableUntil
                      ? `back ${stamp(provider.quotaUnavailableUntil).slice(0, 16)}`
                      : (provider.quotaReason ?? "unavailable")}
                </span>
              </Row>
            ))}
          </Panel>
        ) : (
          <Empty icon={Plug}>No provider profile is registered on this hub.</Empty>
        )}
      </Section>
    </>
  );
}

/**
 * §6.3 — the operator's half of pairing.
 *
 * The list shows what asked; the code proves which one. The hub deliberately
 * never sends the code down, so somebody who can read this screen still
 * cannot approve the machine they just enrolled.
 */
function Pairing({
  waiting,
  stale,
  organizationId,
  onDone,
}: {
  waiting: WaitingMachine[];
  stale: WaitingMachine[];
  organizationId: string | null;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const { run, pending, error } = useAction();

  if (waiting.length === 0) {
    // Requests whose window closed are shown, and shown as dead — hiding them
    // would leave an operator wondering where their machine went, and
    // offering a code box for them would waste their time.
    return stale.length === 0 ? null : (
      <Section title="Asked too long ago" count={stale.length}>
        <Note tone="quiet">
          {stale.map((machine) => machine.hostname).join(", ")} asked to be
          paired, but the code stopped being valid. Nothing here can be typed:
          restart the worker on that machine for a fresh one — or, if it is
          already paired, attach it below instead.
        </Note>
      </Section>
    );
  }

  return (
    <Section title="Waiting to be paired" count={waiting.length}>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="divide-border divide-y">
          {waiting.map((machine) => (
            <Row key={machine.hostname}>
              <Stripe tone={machine.expired ? "quiet" : "waiting"} />
              <span className="flex-1 text-sm font-medium">
                {machine.hostname}
                {/* A machine that asked more than once is restarting. Worth
                    saying, because the operator still approves it only once. */}
                {machine.requests > 1 ? (
                  <span className="text-signal ml-2 text-xs font-normal">
                    asked <span className="measure">{machine.requests}</span> times
                  </span>
                ) : null}
              </span>
              <span className="measure text-muted-foreground text-xs">
                {machine.operatingSystem}/{machine.architecture}
              </span>
              <span className="text-muted-foreground text-xs">
                {machine.capabilities.join(", ") || "declares nothing"}
              </span>
              <span
                className={`measure w-20 text-right text-xs ${
                  machine.expired ? "text-signal" : "text-muted-foreground"
                }`}
              >
                {machine.expired ? "expired" : since(machine.since)}
              </span>
            </Row>
          ))}
        </div>

        {organizationId ? (
          <form
            className="bg-muted/50 flex items-end gap-3 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => api.enrolments.decide(organizationId, code.trim().toUpperCase(), true),
                () => {
                  setCode("");
                  onDone();
                },
              );
            }}
          >
            <Field
              label="Code printed on that machine"
              value={code}
              onChange={setCode}
              placeholder="Q6YWCJ19"
              className="max-w-xs flex-1"
            />
            <Button type="submit" size="sm" disabled={pending || code.trim().length < 4}>
              <KeyRound />
              {pending ? "Pairing…" : "Pair"}
            </Button>
          </form>
        ) : (
          <div className="border-t p-4">
            <Note>Only an organization owner can pair a machine.</Note>
          </div>
        )}
      </Card>
      {error ? (
        <div className="mt-3 max-w-md">
          <Note>{error}</Note>
        </div>
      ) : null}
    </Section>
  );
}

/**
 * §6.10 — a machine you already own, brought to this workspace.
 *
 * Approving an enrolment binds a machine to the ORGANIZATION. Serving a
 * workspace is a second act, and without this the second one had no button:
 * a new workspace listed nothing, and the only thing on screen was a pairing
 * form, which is why somebody would try to pair a machine twice.
 */
function Attach({
  machines,
  pending,
  onAttach,
}: {
  machines: FleetView[];
  pending: boolean;
  onAttach: (workerId: string) => void;
}) {
  if (machines.length === 0) return null;

  return (
    <Section title="Your other machines" count={machines.length}>
      <div className="mb-3">
        <Note tone="quiet">
          These are already paired with your organization. Pairing them again
          is not possible and not needed — attaching is the second act, and
          this is it.
        </Note>
      </div>
      <Panel>
        {machines.map((machine) => (
          <Row key={machine.id}>
            <Stripe tone={toneOf(machine.status)} />
            <span className="flex-1 text-sm font-medium">{machine.hostname}</span>
            <span className="measure text-muted-foreground text-xs">
              {machine.operatingSystem}/{machine.architecture}
            </span>
            <span className="text-muted-foreground text-xs">
              {machine.capabilities.join(", ") || "declares nothing"}
            </span>
            <span className="text-muted-foreground w-32 text-right text-xs">
              {machine.serves.length === 0
                ? "serves no workspace"
                : `serves ${machine.serves.length} other${machine.serves.length === 1 ? "" : "s"}`}
            </span>
            <Button size="sm" disabled={pending} onClick={() => onAttach(machine.id)}>
              <Plug />
              Attach here
            </Button>
          </Row>
        ))}
      </Panel>
    </Section>
  );
}
