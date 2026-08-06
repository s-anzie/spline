"use client";

import { useState } from "react";
import { FolderGit2, GitBranch, Plus, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Field,
  Id,
  Loading,
  Note,
  Panel,
  Row,
  Section,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * §8.3 — the projects this workspace's agents work in.
 *
 * Nothing here existed until now, and its absence is what made the whole git
 * side dead code: a task can name a repository, the machine knows what to do
 * with one, and there was no way for a person to say that any repository
 * exists at all.
 *
 * Two fields carry it, and both are needed for different reasons. The ADDRESS
 * is how a machine that does not have the project gets it. The PATH is where
 * it already is on the machines that do — and that one is what makes the work
 * usable, because a fresh clone of a real project has no dependencies
 * installed, no `.env`, no build cache. An agent dropped into one spends its
 * run discovering that nothing runs.
 */
export function Repositories({ workspaceId }: { workspaceId: string }) {
  const repositories = useResource(
    () => api.repositories.list(workspaceId),
    [workspaceId],
  );
  const [adding, setAdding] = useState(false);

  const all = repositories.data ?? [];

  return (
    <Section
      title="Projects"
      count={all.length}
      actions={
        <Button variant="outline" size="sm" onClick={() => setAdding((open) => !open)}>
          <Plus />
          {adding ? "Cancel" : "Add a project"}
        </Button>
      }
    >
      {adding ? (
        <div className="mb-4">
          <AddRepository
            workspaceId={workspaceId}
            onDone={() => {
              setAdding(false);
              repositories.reload();
            }}
          />
        </div>
      ) : null}

      {repositories.loading ? <Loading rows={2} /> : null}
      {repositories.error ? <Note>{repositories.error}</Note> : null}

      {repositories.data && all.length === 0 && !adding ? (
        <Empty icon={FolderGit2} title="No project yet">
          Add one, and a task can then be worked on inside it — on a branch of
          its own, in the copy this machine already has.
        </Empty>
      ) : null}

      {all.length > 0 ? (
        <Panel>
          {all.map((repository) => (
            <Row key={repository.id} className="py-3">
              <Stripe tone={repository.status === "ACTIVE" ? "settled" : "quiet"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-sm font-medium">{repository.name}</span>
                  <span className="measure text-muted-foreground truncate text-xs">
                    {repository.origin || "on this machine only"}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="size-3" />
                    <span className="measure">{repository.defaultBranch}</span>
                  </span>
                  {repository.localPath ? (
                    <span className="measure truncate">{repository.localPath}</span>
                  ) : (
                    <span>each machine clones its own copy</span>
                  )}
                  <span
                    className="inline-flex items-center gap-1.5"
                    title="Branches no agent may work on directly (§8.11)"
                  >
                    <ShieldCheck className="size-3" />
                    <span className="measure">
                      {repository.protectedBranches.join(", ")}
                    </span>
                  </span>
                </div>
              </div>
              <Id value={repository.id} />
            </Row>
          ))}
        </Panel>
      ) : null}
    </Section>
  );
}

function AddRepository({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const { run, pending, error } = useAction();

  return (
    <Card className="gap-0 p-4 shadow-none">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () =>
              api.repositories.register(workspaceId, {
                name: name.trim(),
                ...(origin.trim() ? { origin: origin.trim() } : {}),
                ...(localPath.trim() ? { localPath: localPath.trim() } : {}),
                ...(defaultBranch.trim() ? { defaultBranch: defaultBranch.trim() } : {}),
              }),
            onDone,
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            value={name}
            onChange={setName}
            placeholder="spline"
            autoFocus
          />
          <Field
            label="Default branch"
            value={defaultBranch}
            onChange={setDefaultBranch}
            placeholder="main"
            hint="Protected: no agent works on it directly."
          />
        </div>
        <Field
          label="Address"
          value={origin}
          onChange={setOrigin}
          placeholder="git@github.com:you/spline.git"
          hint="How a machine that does not have the project gets it. Its own credentials do the talking — nothing is stored here."
        />
        <Field
          label="Where it lives on your machines"
          value={localPath}
          onChange={setLocalPath}
          placeholder="/home/you/projects/spline"
          hint="The copy that already has its dependencies installed, its .env, its build cache. That copy is the environment the work needs."
        />

        {/**
         * §8.3 — one of the two, and the consequence of each. Said here
         * rather than left to be discovered at the first run, which is a
         * lesson that costs an evening.
         */}
        {!origin.trim() && localPath.trim() ? (
          <Note tone="waiting">
            With no address, this project exists on that one machine and
            nowhere else. Every agent working on it has to be on that machine,
            and their work stays in its history until you push it yourself.
          </Note>
        ) : null}
        {origin.trim() && !localPath.trim() ? (
          <Note tone="quiet">
            With no path, each machine clones its own copy — which works, and
            starts with nothing installed. A first run in it spends its time
            discovering that.
          </Note>
        ) : null}

        {error ? <Note>{error}</Note> : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            // One of the two is enough; neither is nothing.
            disabled={pending || !name.trim() || (!origin.trim() && !localPath.trim())}
          >
            {pending ? "Adding…" : "Add the project"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
