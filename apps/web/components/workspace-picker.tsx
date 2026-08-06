"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen } from "lucide-react";

import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { Empty, PageHeader, Panel, Row, Status, Stripe } from "@/components/kit";

/**
 * §4.2 — every read is scoped to one workspace, so this is the only screen
 * that exists before one is chosen.
 *
 * There is deliberately no "all workspaces" option: a console that could
 * aggregate across them would be the first thing to leak between them.
 */
export function WorkspacePicker() {
  const { workspaces, chooseWorkspace } = useSession();
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Choose a workspace"
        lead="Everything you do from here on is scoped to the one you pick. Nothing is ever read across two."
      />

      {workspaces.length === 0 ? (
        <Empty icon={FolderOpen} title="You are not in a workspace yet">
          Whoever owns the organization can add you to one.
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
