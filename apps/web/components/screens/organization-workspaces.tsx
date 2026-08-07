"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Layers } from "lucide-react";

import { routes } from "@/lib/routes";
import { useOrganization, useSession, useWorkspacesHere } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { AddButton, NewWorkspace } from "@/components/forms";
import { Empty, PageHeader, Panel, Row, Status, Stripe } from "@/components/kit";

/**
 * §4.2 — every workspace this organization holds.
 *
 * Listing them is all this screen does. There is deliberately no roll-up of
 * what is inside them: an aggregate across workspaces is exactly the read the
 * isolation rule forbids, and a console that offered one would be the first
 * thing to leak between them.
 */
export function WorkspaceList() {
  const workspaces = useWorkspacesHere();
  const chooseWorkspace = useSession((state) => state.chooseWorkspace);
  const organization = useOrganization();
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Workspaces"
        lead={`Everything ${organization?.name ?? "this organization"} holds. Each one keeps its own goals, tasks, machines and record — nothing is ever read across two.`}
        actions={<NewWorkspace trigger={<AddButton>New workspace</AddButton>} />}
      />

      {workspaces.length === 0 ? (
        <Empty icon={Layers} title="No workspace yet">
          A workspace is where the work lives. Machines and agents belong to the
          organization and are lent to whichever workspaces need them.
        </Empty>
      ) : (
        <Panel>
          {workspaces.map((workspace) => (
            <Row
              key={workspace.id}
              className="py-4"
              onOpen={() => {
                chooseWorkspace(workspace.id);
                router.push(routes.queue);
              }}
            >
              <Stripe tone={toneOf(workspace.status)} />
              <span className="flex-1 text-sm font-medium">{workspace.name}</span>
              <Status value={workspace.status} />
              <ArrowRight className="text-muted-foreground size-3.5" />
            </Row>
          ))}
        </Panel>
      )}
    </>
  );
}
