"use client";

import { useState } from "react";
import { Cpu, KeyRound, Plug, PlugZap, Radio } from "lucide-react";

import { api } from "@/lib/api";
import { collapse, type WaitingMachine } from "@/lib/enrolments";
import { since, stamp } from "@/lib/format";
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

/**
 * §6.3 — the computers this organization owns.
 *
 * Above any workspace, because that is where a machine belongs: approving an
 * enrolment binds it to the ORGANIZATION, and serving a workspace is a second
 * act it may repeat as often as you like. Mixing the two on one screen made
 * "your machines" mean a different set depending on where the reader stood.
 */
export function Fleet() {
  const organizationId = useOrganizationId();
  const workspaces = useSession((state) => state.workspaces);

  const fleet = useResource(() => api.fleet(organizationId!), [organizationId], {
    pollMs: 15_000,
    enabled: Boolean(organizationId),
  });
  const enrolments = useResource(
    () => api.enrolments.pending(organizationId!),
    [organizationId],
    { pollMs: 10_000, enabled: Boolean(organizationId) },
  );
  const providers = useResource(() => api.runtime.providers(), [], { pollMs: 60_000 });

  const machines = fleet.data ?? [];
  const paged = usePaged(machines);
  const asking = collapse(enrolments.data ?? []);
  const waiting = asking.filter((machine) => !machine.expired);
  const stale = asking.filter((machine) => machine.expired);
  const serving = machines.filter((machine) => machine.serves.length > 0).length;
  const reporting = machines.filter((machine) => !machine.stale).length;

  const nameOf = (workspaceId: string) =>
    workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
    workspaceId.slice(0, 8);

  if (!organizationId) {
    return (
      <>
        <PageHeader title="Machines" />
        <Note>Only an organization&apos;s owner can see its machines.</Note>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Machines"
        lead="Every computer you own. A machine reaches out to the hub and is paired to this organization; serving a workspace is a separate decision, made on that workspace's own screen."
      />

      <StatRow>
        <Stat
          label="Reporting"
          value={`${reporting}/${machines.length}`}
          icon={Radio}
          tone={
            machines.length === 0
              ? "quiet"
              : reporting === machines.length
                ? "settled"
                : "signal"
          }
          hint={
            machines.length === 0
              ? "none paired yet"
              : reporting === machines.length
                ? "all heartbeats current"
                : "one has gone quiet"
          }
        />
        <Stat
          label="Serving something"
          value={serving}
          icon={Cpu}
          tone={serving ? "settled" : "quiet"}
          hint={
            machines.length === 0
              ? "nothing to lend yet"
              : serving === machines.length
                ? "all of them are in use"
                : `${machines.length - serving} idle`
          }
        />
        <Stat
          label="At the door"
          value={waiting.length}
          icon={KeyRound}
          tone={waiting.length ? "waiting" : "quiet"}
          hint={
            waiting.length
              ? "needs the code from its console"
              : stale.length
                ? `${stale.length} asked too long ago`
                : "nobody waiting"
          }
        />
        <Stat
          label="Providers"
          value={(providers.data ?? []).filter((one) => one.effectiveAvailable).length}
          icon={Plug}
          tone="settled"
          hint="available to dispatch to"
        />
      </StatRow>

      <Pairing
        waiting={waiting}
        stale={stale}
        organizationId={organizationId}
        onDone={() => {
          enrolments.reload();
          fleet.reload();
        }}
      />

      <Section title="Paired machines" count={machines.length}>
        {fleet.loading ? <Loading rows={2} /> : null}
        {fleet.error ? <Note>{fleet.error}</Note> : null}
        {fleet.data && machines.length === 0 ? (
          <Empty icon={Cpu} title="No machine yet">
            Start the worker on a computer you own, configured with this
            organization. It prints a code on its own console, and you type
            that code above.
          </Empty>
        ) : null}
        {machines.length > 0 ? (
          <>
            <Panel>
              {paged.items.map((machine) => (
                <div key={machine.id} className="flex items-stretch gap-3 px-4 py-3.5">
                  {/* Stale beats status: a machine whose last word was "ONLINE"
                      an hour ago is not online, whatever the row says. */}
                  <Stripe
                    tone={machine.stale ? "signal" : toneOf(machine.status)}
                    live={!machine.stale && machine.status === "ONLINE"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2.5">
                      <p className="text-sm font-medium">{machine.hostname}</p>
                      <span className="measure text-muted-foreground text-xs">
                        {machine.operatingSystem}/{machine.architecture}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      can run {machine.capabilities.join(", ") || "nothing it declared"}
                      {machine.labels.length ? ` · ${machine.labels.join(" · ")}` : ""}
                    </p>
                    <p
                      className={`mt-1 text-xs ${machine.stale ? "text-signal" : "text-muted-foreground"}`}
                    >
                      {machine.stale
                        ? `silent since ${since(machine.lastHeartbeatAt)} — it has stopped reporting`
                        : `last heartbeat ${since(machine.lastHeartbeatAt)}`}
                    </p>
                    {/* §17.8 — which workspaces, named. A count would send the
                        reader hunting for which ones. */}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {machine.serves.length === 0
                        ? "serves no workspace — attach it from a workspace's Machines screen"
                        : `serves ${machine.serves.map(nameOf).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Status value={machine.stale ? "DEGRADED" : machine.status} />
                    <Id value={machine.id} />
                  </div>
                </div>
              ))}
            </Panel>
            <Pager paged={paged} />
          </>
        ) : null}
      </Section>

      <Section title="Providers" count={providers.data?.length}>
        {providers.data?.length ? (
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
          <Empty icon={PlugZap}>No provider profile is registered on this hub.</Empty>
        )}
      </Section>
    </>
  );
}

/**
 * §6.3 — the operator's half of pairing.
 *
 * The list shows what asked; the code proves which one. The hub never sends
 * the code down, so somebody who can read this screen still cannot approve
 * the machine they just enrolled.
 */
function Pairing({
  waiting,
  stale,
  organizationId,
  onDone,
}: {
  waiting: WaitingMachine[];
  stale: WaitingMachine[];
  organizationId: string;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const { run, pending, error } = useAction();

  if (waiting.length === 0) {
    // Requests whose window closed are shown, and shown as dead: hiding them
    // leaves an operator wondering where their machine went, and offering a
    // code box for them wastes their time.
    return stale.length === 0 ? null : (
      <Section title="Asked too long ago" count={stale.length}>
        <Note tone="quiet">
          {stale.map((machine) => machine.hostname).join(", ")} asked to be
          paired, but the code stopped being valid. Nothing here can be typed:
          restart the worker on that machine for a fresh one.
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
              <Stripe tone="waiting" />
              <span className="flex-1 text-sm font-medium">
                {machine.hostname}
                {/* A machine that asked more than once is restarting. Worth
                    saying: the operator still approves it only once. */}
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
              <span className="measure text-muted-foreground w-20 text-right text-xs">
                {since(machine.since)}
              </span>
            </Row>
          ))}
        </div>

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
      </Card>
      {error ? (
        <div className="mt-3 max-w-md">
          <Note>{error}</Note>
        </div>
      ) : null}
    </Section>
  );
}
