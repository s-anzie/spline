"use client";

import { useState } from "react";
import {
  Ban,
  KeyRound,
  Plug,
  PlugZap,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { api, type PolicyView } from "@/lib/api";
import { humanise, since, stamp } from "@/lib/format";
import { ENFORCED, ENFORCED_RULES, humanMs, type EnforcedRule } from "@/lib/rules";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Field,
  Loading,
  Note,
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
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddButton } from "@/components/forms";

/**
 * The rules this workspace runs under.
 *
 * Written against what the hub actually enforces rather than against what it
 * will store. The Policy Engine takes any rule name with any JSON value — a
 * screen that listed them all as equals would make every one of them look
 * like it does something, and most do not yet have a consumer.
 */
export function Governance({ workspaceId }: { workspaceId: string }) {
  const policies = useResource(() => api.policies.list(workspaceId), [workspaceId]);
  const { run, pending, error } = useAction();

  const all = policies.data ?? [];
  const active = all.filter((policy) => policy.enabled);
  const set = new Map(active.map((policy) => [policy.rule, policy] as const));
  const recordedOnly = active.filter((policy) => !ENFORCED.has(policy.rule));

  return (
    <>
      <StatRow>
        <Stat
          label="Rules in force"
          value={`${ENFORCED_RULES.filter((rule) => set.has(rule.rule)).length}/${ENFORCED_RULES.length}`}
          icon={Scale}
          tone={set.size ? "settled" : "quiet"}
          hint="the rest run on the hub's defaults"
        />
        <Stat
          label="Policies set"
          value={active.length}
          icon={ShieldCheck}
          hint="enabled, across every scope"
        />
        <Stat
          label="Recorded only"
          value={recordedOnly.length}
          icon={TriangleAlert}
          tone={recordedOnly.length ? "waiting" : "quiet"}
          hint={
            recordedOnly.length
              ? "stored, but nothing reads them yet"
              : "every policy set here is enforced"
          }
        />
        <Stat
          label="Disabled"
          value={all.length - active.length}
          icon={Ban}
          hint="kept, so the history stays readable"
        />
      </StatRow>

      {error ? (
        <div className="mb-4">
          <Note>{error}</Note>
        </div>
      ) : null}
      {policies.loading ? <Loading rows={4} /> : null}
      {policies.error ? <Note>{policies.error}</Note> : null}

      <Automation workspaceId={workspaceId} />

      <Section title="What this workspace enforces" count={ENFORCED_RULES.length}>
        <Panel>
          {ENFORCED_RULES.map((rule) => (
            <RuleRow
              key={rule.rule}
              rule={rule}
              policy={set.get(rule.rule)}
              workspaceId={workspaceId}
              pending={pending}
              onDisable={(policyId) =>
                void run(() => api.policies.disable(workspaceId, policyId), policies.reload)
              }
              onDone={policies.reload}
            />
          ))}
        </Panel>
      </Section>

      {/**
       * Said out loud rather than hidden: a policy nothing reads is a policy
       * whose author believes it is doing something.
       */}
      {recordedOnly.length > 0 ? (
        <Section title="Recorded, not enforced" count={recordedOnly.length}>
          <div className="mb-3">
            <Note tone="waiting">
              These are stored and resolved correctly, but no part of the hub
              reads them yet. They will start applying the day something does —
              and not a moment before.
            </Note>
          </div>
          <Panel>
            {recordedOnly.map((policy) => (
              <Row key={policy.id}>
                <Stripe tone="waiting" />
                <span className="measure flex-1 text-sm">{policy.rule}</span>
                <span className="label">{humanise(policy.type)}</span>
                <span className="measure text-muted-foreground max-w-56 truncate text-xs">
                  {JSON.stringify(policy.value)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    void run(() => api.policies.disable(workspaceId, policy.id), policies.reload)
                  }
                >
                  Disable
                </Button>
              </Row>
            ))}
          </Panel>
        </Section>
      ) : null}

      <Providers />
      <Secrets workspaceId={workspaceId} />
    </>
  );
}

function RuleRow({
  rule,
  policy,
  workspaceId,
  pending,
  onDisable,
  onDone,
}: {
  rule: EnforcedRule;
  policy: PolicyView | undefined;
  workspaceId: string;
  pending: boolean;
  onDisable: (policyId: string) => void;
  onDone: () => void;
}) {
  const value = policy?.value as unknown;
  const shown =
    policy === undefined
      ? null
      : rule.kind === "number" && typeof value === "number"
        ? humanMs(value)
        : Array.isArray(value)
          ? value.join(", ")
          : JSON.stringify(value);

  return (
    <div className="flex items-stretch gap-3 px-4 py-3.5">
      <Stripe tone={policy ? "settled" : "quiet"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <span className="measure text-sm font-medium">{rule.rule}</span>
          <span className="label">{humanise(rule.type)}</span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{rule.does}</p>
        <p className="mt-1 text-xs">
          {shown === null ? (
            <span className="text-muted-foreground">
              not set — {rule.fallback}
            </span>
          ) : (
            <span>
              <span className="text-foreground measure">{shown}</span>
              <span className="text-muted-foreground">
                {" "}
                · set {since(policy!.updatedAt)} at {humanise(policy!.scope.type)} scope
              </span>
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SetRule rule={rule} workspaceId={workspaceId} onDone={onDone} current={shown} />
        {policy ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onDisable(policy.id)}
          >
            Unset
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SetRule({
  rule,
  workspaceId,
  current,
  onDone,
}: {
  rule: EnforcedRule;
  workspaceId: string;
  current: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const { run, pending, error } = useAction();

  const parsed: unknown =
    rule.kind === "number"
      ? Number(raw)
      : raw
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
  const usable =
    rule.kind === "number"
      ? Number.isFinite(parsed as number) && (parsed as number) > 0
      : Array.isArray(parsed) && parsed.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {current === null ? "Set" : "Change"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="measure text-base">{rule.rule}</DialogTitle>
          <DialogDescription className="leading-relaxed">{rule.does}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                api.policies.set(workspaceId, {
                  // Set at the workspace, the scope every task inherits.
                  // Narrower ones exist and are resolved by precedence; they
                  // are not something to reach for from a settings screen.
                  scopeType: "WORKSPACE",
                  scopeId: workspaceId,
                  type: rule.type,
                  rule: rule.rule,
                  value: parsed,
                }),
              () => {
                setOpen(false);
                setRaw("");
                onDone();
              },
            );
          }}
        >
          <Field
            label={rule.kind === "number" ? `Value in ${rule.unit}` : "Values, comma separated"}
            value={raw}
            onChange={setRaw}
            placeholder={rule.example}
            autoFocus
          />
          {rule.kind === "number" && usable ? (
            <p className="text-muted-foreground text-xs">
              That is <span className="text-foreground">{humanMs(parsed as number)}</span>.
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs leading-relaxed">
            Unset, this rule falls back to: {rule.fallback}.
          </p>
          {error ? <Note>{error}</Note> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !usable}>
              {pending ? "Applying…" : "Apply to this workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * §4.14 — a provider's availability is declared, never guessed at.
 *
 * Global, not per workspace: a quota is exhausted for everybody at once, and
 * pretending otherwise would have each workspace discover it separately.
 */
function Providers() {
  const providers = useResource(() => api.runtime.providers(), [], { pollMs: 30_000 });
  const { run, pending, error } = useAction();

  return (
    <Section title="Providers" count={providers.data?.length}>
      {error ? (
        <div className="mb-3">
          <Note>{error}</Note>
        </div>
      ) : null}
      {providers.data?.length ? (
        <Panel>
          {providers.data.map((provider) => (
            <div key={provider.id} className="flex items-stretch gap-3 px-4 py-3.5">
              <Stripe tone={provider.effectiveAvailable ? "settled" : "signal"} />
              <Plug className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-sm font-medium">{provider.provider}</span>
                  <span className="text-muted-foreground text-xs">
                    {provider.capabilities.join(", ") || "no capability declared"}
                  </span>
                </div>
                <p className="mt-1 text-xs">
                  {provider.effectiveAvailable ? (
                    <span className="text-muted-foreground">
                      available — dispatch may choose it
                    </span>
                  ) : (
                    <span className="text-signal">
                      unavailable
                      {provider.quotaUnavailableUntil
                        ? ` until ${stamp(provider.quotaUnavailableUntil).slice(0, 16)}`
                        : ""}
                      {provider.quotaReason ? ` · ${provider.quotaReason}` : ""}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Status value={provider.effectiveAvailable ? "ACTIVE" : "DEGRADED"} />
                {provider.effectiveAvailable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run(
                        () =>
                          api.runtime.setAvailability(provider.provider, {
                            action: "DISABLE",
                            reason: "turned off from the console",
                          }),
                        providers.reload,
                      )
                    }
                  >
                    <Ban />
                    Turn off
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run(
                        () =>
                          api.runtime.setAvailability(provider.provider, {
                            action: "RESTORE",
                          }),
                        providers.reload,
                      )
                    }
                  >
                    <PlugZap />
                    Turn back on
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Panel>
      ) : (
        <Empty icon={Plug}>No provider profile is registered on this hub.</Empty>
      )}
    </Section>
  );
}

/** §18.4 — names, and when each was last read. Never a value. */
function Secrets({ workspaceId }: { workspaceId: string }) {
  const secrets = useResource(() => api.secrets.list(workspaceId), [workspaceId]);
  const { run, pending, error } = useAction();

  return (
    <Section
      title="Secrets"
      count={secrets.data?.length}
      actions={<NewSecret workspaceId={workspaceId} onDone={secrets.reload} />}
    >
      {error ? (
        <div className="mb-3">
          <Note>{error}</Note>
        </div>
      ) : null}
      {secrets.error ? <Note>{secrets.error}</Note> : null}
      {secrets.data?.length ? (
        <Panel>
          {secrets.data.map((secret) => (
            <Row key={secret.name}>
              {/* Never read is either brand new, or dead weight. */}
              <Stripe tone={secret.lastAccessedAt ? "settled" : "quiet"} />
              <KeyRound className="text-muted-foreground size-3.5 shrink-0" />
              <span className="measure flex-1 text-sm">{secret.name}</span>
              <span className="text-muted-foreground text-xs">
                {secret.lastAccessedAt
                  ? `last used ${since(secret.lastAccessedAt)}`
                  : "never used"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-signal"
                disabled={pending}
                onClick={() =>
                  void run(() => api.secrets.remove(workspaceId, secret.name), secrets.reload)
                }
              >
                Delete
              </Button>
            </Row>
          ))}
        </Panel>
      ) : secrets.data ? (
        <Empty icon={KeyRound} title="No secret stored">
          A dispatch carries secret NAMES; the machine fetches the values with
          the order it holds. Nothing here is ever shown again once written.
        </Empty>
      ) : null}
    </Section>
  );
}

function NewSecret({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const { run, pending, error } = useAction();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <AddButton>Add a secret</AddButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a secret</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Sealed on arrival and never shown again — not here, not in an
            order, not in a log. A dispatch carries the name; the machine that
            holds the order fetches the value.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => api.secrets.set(workspaceId, name.trim(), value),
              () => {
                setOpen(false);
                setName("");
                setValue("");
                onDone();
              },
            );
          }}
        >
          <Field
            label="Name"
            value={name}
            onChange={setName}
            placeholder="ANTHROPIC_API_KEY"
            autoFocus
          />
          <Field label="Value" type="password" value={value} onChange={setValue} />
          {error ? <Note>{error}</Note> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || !value}>
              {pending ? "Sealing…" : "Seal it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * §9 — the one rule here that is set rather than only stated.
 *
 * It lives beside the enforced rules because that is what it is: a ceiling
 * the hub applies, not a console preference. And it is per workspace on
 * purpose — the one somebody experiments in and the one that matters should
 * not share a ceiling.
 */
function Automation({ workspaceId }: { workspaceId: string }) {
  const workspace = useResource(() => api.workspaces.get(workspaceId), [workspaceId]);
  const { run, pending, error } = useAction();

  const bag = (workspace.data?.settings ?? {}) as Record<string, unknown>;
  const current = (typeof bag.automation === "object" && bag.automation !== null
    ? bag.automation
    : {}) as Record<string, unknown>;
  const on = current.automatic === true;
  const concurrent = typeof current.concurrentRuns === "number" ? current.concurrentRuns : 3;
  const perDay = typeof current.runsPerDay === "number" ? current.runsPerDay : 20;

  /**
   * The whole bag goes back, with only this key changed. A settings object is
   * open by design, so sending just the part this screen understands would
   * drop whatever else is in there.
   */
  const save = (next: Record<string, unknown>) =>
    void run(
      () =>
        api.workspaces.update(workspaceId, {
          settings: { ...bag, automation: { ...current, ...next } },
        }),
      workspace.reload,
    );

  return (
    <Section title="Work the hub starts on its own">
      <Card className="gap-0 p-4 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="measure text-muted-foreground max-w-md text-sm leading-relaxed">
            When this is on, a task somebody assigns is dispatched without
            anybody pressing anything — which is what lets a manager cut work up
            and have it done. It is off until you say otherwise, because turning
            it on starts spending.
          </p>
          <Segmented
            value={on ? "on" : "off"}
            onChange={(next: string) => save({ automatic: next === "on" })}
            options={[
              { value: "off", label: "Only when I say" },
              { value: "on", label: "On its own" },
            ]}
          />
        </div>

        {on ? (
          <div className="border-border mt-4 grid gap-5 border-t pt-4 sm:grid-cols-2">
            <div>
              <p className="label mb-1.5">At the same time</p>
              <Segmented
                value={String(concurrent)}
                onChange={(next: string) => save({ concurrentRuns: Number(next) })}
                options={["1", "2", "3", "5", "8"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                How many runs may be in flight here at once. Each one is a
                machine working and a provider being paid.
              </p>
            </div>
            <div>
              <p className="label mb-1.5">In a day</p>
              <Segmented
                value={String(perDay)}
                onChange={(next: string) => save({ runsPerDay: Number(next) })}
                options={["10", "20", "50", "100", "250"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                Past this the hub stops starting things and waits for you. It is
                what a misread instruction costs before somebody notices.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3">
            <Note>{error}</Note>
          </div>
        ) : null}
        {pending ? (
          <p className="text-muted-foreground mt-3 text-xs">Saving…</p>
        ) : null}
      </Card>
    </Section>
  );
}
