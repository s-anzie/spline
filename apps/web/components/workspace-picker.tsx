"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen } from "lucide-react";

import { routes } from "@/lib/routes";
import { useSession, useWorkspacesHere } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { Empty, PageHeader, Panel, Row, Status, Stripe } from "@/components/kit";
import { AddButton, NewWorkspace } from "@/components/forms";

/**
 * §4.2 — every read is scoped to one workspace, so this is the only screen
 * that exists before one is chosen.
 *
 * There is deliberately no "all workspaces" option: a console that could
 * aggregate across them would be the first thing to leak between them.
 */
export function WorkspacePicker() {
  // Only this organization's workspaces: the others exist, but not from
  // where the reader is standing (§4.1).
  const workspaces = useWorkspacesHere();
  const chooseWorkspace = useSession((state) => state.chooseWorkspace);
  const router = useRouter();

  return (
    <>
      <PageHeader
        title={workspaces.length ? "Choose a workspace" : "Start here"}
        lead="Everything you do from here on is scoped to the one you pick. Nothing is ever read across two."
        actions={<NewWorkspace trigger={<AddButton>New workspace</AddButton>} />}
      />

      {workspaces.length === 0 ? (
        <Empty icon={FolderOpen} title="No workspace yet">
          A workspace is where goals, tasks, machines and the record live.
          Create one — or ask whoever owns the organization to add you to
          theirs.
        </Empty>
      ) : (
        <Panel>
          {workspaces.map((workspace) => (
            <Row
              key={workspace.id}
              onOpen={() => {
                chooseWorkspace(workspace.id);
                router.push(routes.queue);
              }}
              className="py-4"
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
