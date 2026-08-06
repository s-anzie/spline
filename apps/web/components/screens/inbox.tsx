"use client";

import Link from "next/link";
import { ArrowRight, Inbox as InboxIcon, MailCheck, Megaphone } from "lucide-react";

import { api } from "@/lib/api";
import { humanise, since } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Payload,
  Row,
  Section,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";

/**
 * What was addressed to me, and everything addressed to anyone.
 *
 * The two lists are separate on purpose. A recipient row is resolved at
 * creation — one line per real addressee — so reading a broadcast marks it
 * read for me and for nobody else. One merged list would rebuild the exact
 * ambiguity that per-recipient rows exist to remove.
 */
export function Inbox() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const unread = useResource(() => api.notifications.unread(workspaceId), [workspaceId], {
    pollMs: 15_000,
  });
  const all = useResource(() => api.notifications.list(workspaceId), [workspaceId], {
    pollMs: 30_000,
  });
  const { run, pending, error } = useAction();
  const pendingRead = usePaged(unread.data ?? []);
  const sent = usePaged(all.data ?? []);

  const reload = () => {
    unread.reload();
    all.reload();
  };

  return (
    <>
      <PageHeader
        title="Inbox"
        lead="Messages and alerts addressed to you by name. Marking one read marks it read for you — never for the others it was sent to."
      />

      {error ? (
        <div className="mb-6">
          <Note>{error}</Note>
        </div>
      ) : null}

      <Section title="Unread, for you" count={unread.data?.length}>
        {unread.loading ? <Loading rows={2} /> : null}
        {unread.error ? <Note>{unread.error}</Note> : null}
        {unread.data && unread.data.length === 0 ? (
          <Empty icon={MailCheck} title="Nothing unread">
            Everything addressed to you has been read.
          </Empty>
        ) : null}
        {unread.data && unread.data.length > 0 ? (
          <>
          <Panel>
            {pendingRead.items.map((recipient) => (
              <div key={recipient.id} className="flex items-stretch gap-3 px-4 py-3.5">
                <Stripe
                  tone={recipient.notification.kind === "SYSTEM_ALERT" ? "signal" : "waiting"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="label shrink-0">
                      {humanise(recipient.notification.kind)}
                    </span>
                    <p className="flex-1 text-sm font-medium">
                      {recipient.notification.title}
                    </p>
                    <span className="measure text-muted-foreground shrink-0 text-xs">
                      {since(recipient.notification.createdAt)}
                    </span>
                  </div>
                  {recipient.notification.body ? (
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                      {recipient.notification.body}
                    </p>
                  ) : null}
                  <Payload value={recipient.notification.payload} />

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {/* §20.6 — the recipient's own state machine says which
                        acknowledgements are still open to it. */}
                    {recipient.allowedStatusTargets.map((target) => (
                      <Button
                        key={target}
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () =>
                              api.notifications.mark(
                                workspaceId,
                                recipient.notificationId,
                                target,
                              ),
                            reload,
                          )
                        }
                      >
                        {humanise(target)}
                      </Button>
                    ))}
                    {recipient.notification.taskId ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={routes.task(recipient.notification.taskId)}>
                          Open the task
                          <ArrowRight />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </Panel>
          <Pager paged={pendingRead} />
          </>
        ) : null}
      </Section>

      <Section title="Everything sent in this workspace" count={all.data?.length}>
        {all.data && all.data.length > 0 ? (
          <>
          <Panel>
            {sent.items.map((notification) => (
              <Row key={notification.id}>
                {/* An alert is a system fact; a message is somebody talking.
                    The tone follows that, not the scope. */}
                <Stripe
                  tone={notification.kind === "SYSTEM_ALERT" ? "signal" : "quiet"}
                />
                <span className="label w-24 shrink-0">{humanise(notification.kind)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{notification.title}</span>
                {notification.scope === "BROADCAST" ? (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Megaphone className="size-3" />
                    everyone
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">direct</span>
                )}
                <span className="measure text-muted-foreground w-16 shrink-0 text-right text-xs">
                  {since(notification.createdAt)}
                </span>
              </Row>
            ))}
          </Panel>
          <Pager paged={sent} />
          </>
        ) : (
          <Empty icon={InboxIcon} title="Nothing has been sent">
            Notifications appear here as soon as an agent or the hub addresses
            somebody.
          </Empty>
        )}
      </Section>
    </>
  );
}
