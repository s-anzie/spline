"use client";

import { Bot, KeyRound, ShieldOff, Wrench } from "lucide-react";

import { api } from "@/lib/api";
import { since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { useOrganizationId } from "@/lib/store";
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
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { NewAgent } from "@/components/forms";
import { Button } from "@/components/ui/button";

/**
 * §18.2 — the identities this organization has issued.
 *
 * An agent exists here and works in a workspace: the credential is minted
 * once by the organization, and the powers come from a membership with a role
 * in each workspace it joins. Creating one is therefore an organization act,
 * which is why it no longer hides inside a workspace's People tab.
 *
 * Revoked identities stay listed. One that was revoked still ran things, and
 * a list that hid it would make its history unreachable.
 */
export function Agents() {
  const organizationId = useOrganizationId();
  const actors = useResource(() => api.actors.list(organizationId!), [organizationId], {
    pollMs: 30_000,
    enabled: Boolean(organizationId),
  });
  const { run, pending, error } = useAction();

  const all = actors.data ?? [];
  const paged = usePaged(all);
  const live = all.filter((actor) => !actor.revoked);
  const agents = live.filter((actor) => actor.actorType === "AGENT").length;
  const services = live.filter((actor) => actor.actorType === "SERVICE").length;
  const unused = live.filter((actor) => actor.lastUsedAt === null).length;

  if (!organizationId) {
    return (
      <>
        <PageHeader title="Agents" />
        <Note>Only an organization&apos;s owner can see the identities it issued.</Note>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Agents"
        lead="The identities you have issued. An agent is created here, once, and then joins whichever workspaces it works in — with a role in each, like a person."
        actions={<NewAgent onDone={actors.reload} />}
      />

      <StatRow>
        <Stat label="Agents" value={agents} icon={Bot} tone="live" />
        <Stat
          label="Services"
          value={services}
          icon={Wrench}
          hint="issued the same way, for what is not an agent"
        />
        <Stat
          label="Never used"
          value={unused}
          icon={KeyRound}
          tone={unused ? "waiting" : "quiet"}
          hint={unused ? "brand new, or forgotten" : "all have authenticated"}
        />
        <Stat
          label="Revoked"
          value={all.length - live.length}
          icon={ShieldOff}
          hint="kept, so their history stays readable"
        />
      </StatRow>

      {error ? (
        <div className="mb-4">
          <Note>{error}</Note>
        </div>
      ) : null}
      {actors.loading ? <Loading rows={3} /> : null}
      {actors.error ? <Note>{actors.error}</Note> : null}
      {actors.data && all.length === 0 ? (
        <Empty icon={Bot} title="No agent yet">
          An agent needs an identity of its own before any work can be assigned
          to it by name. Creating one hands you its token, once.
        </Empty>
      ) : null}

      {all.length > 0 ? (
        <>
          <Panel>
            {paged.items.map((actor) => (
              <Row key={actor.credentialId}>
                <Stripe tone={actor.revoked ? "quiet" : "live"} />
                <Bot className="text-muted-foreground size-3.5 shrink-0" />
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-medium ${
                    actor.revoked ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {actor.displayName}
                </span>
                <span className="label shrink-0">{actor.actorType.toLowerCase()}</span>
                {/* Sized by its content, not by a guess. A fixed width here
                    wrapped the date onto a second line while the middle of
                    the row sat empty. */}
                <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                  {actor.lastUsedAt ? `last used ${since(actor.lastUsedAt)}` : "never used"}
                </span>
                <span className="text-muted-foreground hidden shrink-0 text-xs whitespace-nowrap lg:inline">
                  added {stamp(actor.createdAt).slice(0, 10)}
                </span>
                <Id value={actor.actorId} />
                {actor.revoked ? (
                  <Status value="DISABLED" />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-signal"
                    disabled={pending}
                    onClick={() =>
                      void run(
                        () => api.actors.revoke(organizationId, actor.credentialId),
                        actors.reload,
                      )
                    }
                  >
                    <ShieldOff />
                    Revoke
                  </Button>
                )}
              </Row>
            ))}
          </Panel>
          <Pager paged={paged} />
        </>
      ) : null}

      <Section title="What revoking does">
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
          It stops the credential working, immediately and everywhere — the next
          call it makes is refused. It does not remove the agent from the
          workspaces it joined, and it does not touch anything it did: the
          record of its runs, decisions and notes stays exactly as it was.
        </p>
      </Section>
    </>
  );
}
