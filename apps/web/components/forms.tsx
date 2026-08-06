"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Copy, Plus, TriangleAlert, UserPlus } from "lucide-react";

import {
  api,
  ROLE_MEANS,
  PRIORITIES,
  WORKSPACE_ROLES,
  type GoalView,
  type MemberView,
} from "@/lib/api";
import { humanise } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useOrganizationId, useSession } from "@/lib/store";
import { useAction, useResource } from "@/lib/use-hub";
import { Area, Criteria, Field, Note, Picker, Segmented } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Every form here shares one shape: a trigger, a body, one act at the end. */
function FormDialog({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  submitLabel,
  pending,
  disabled,
  error,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
  disabled?: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* The scroll lives on the FIELDS, never on the dialog itself: the
          dialog is centred with a transform, and making it a scroll container
          shifted its own contents out from under it. */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid min-h-0 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid max-h-[55vh] gap-4 overflow-y-auto px-1 py-1">
            {children}
          </div>
          {error ? <Note>{error}</Note> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || disabled}>
              {pending ? "Working…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Workspace ───────────────────────────────────────────────────────────── */

/**
 * §4.2 — a workspace is the boundary everything else lives inside, so this is
 * the first thing a new account does. Only a human who owns the organization
 * may: agents operate inside a workspace, never above it.
 */
export function NewWorkspace({ trigger }: { trigger: React.ReactNode }) {
  const organizationId = useOrganizationId();
  const refresh = useSession((state) => state.refreshWorkspaces);
  const choose = useSession((state) => state.chooseWorkspace);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { run, pending, error } = useAction();

  return (
    <FormDialog
      trigger={trigger}
      title="New workspace"
      description="A workspace holds its own goals, tasks, machines and record. Nothing is ever read across two."
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create workspace"
      pending={pending}
      disabled={!organizationId || name.trim().length === 0}
      error={error}
      onSubmit={() =>
        void run(
          () =>
            api.workspaces.create({
              organizationId: organizationId!,
              name: name.trim(),
              ...(description.trim() ? { description: description.trim() } : {}),
            }),
          async (created) => {
            setOpen(false);
            setName("");
            setDescription("");
            await refresh();
            // Land in the thing that was just made, not back on a list of
            // workspaces with no clue which one is new.
            const id = (created as { workspaceId?: string } | undefined)?.workspaceId;
            if (id) choose(id);
            router.push(routes.queue);
          },
        )
      }
    >
      <Field label="Name" value={name} onChange={setName} placeholder="Payments" autoFocus />
      <Area
        label="What it is for"
        value={description}
        onChange={setDescription}
        placeholder="Everything touching billing, invoicing and the payment providers."
        hint="Optional, but it is what a newcomer reads first."
      />
      {!organizationId ? (
        <Note>You do not own an organization, so you cannot create a workspace.</Note>
      ) : null}
    </FormDialog>
  );
}

/* ── The need ────────────────────────────────────────────────────────────── */

/**
 * A goal is where a need enters the system.
 *
 * It is written in the user's own words — what they want, and how anyone will
 * know it happened. Nothing here asks how: the decomposition into tasks is
 * the next step, and it is not the person's job to invent it.
 */
export function NewGoal({ trigger }: { trigger: React.ReactNode }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<string[]>([""]);
  const [priority, setPriority] = useState("NORMAL");
  const { run, pending, error } = useAction();

  const kept = criteria.map((line) => line.trim()).filter(Boolean);

  return (
    <FormDialog
      trigger={trigger}
      title="State a need"
      description="Say what you want and how anyone will know it happened. Breaking it into tasks comes after."
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create the goal"
      pending={pending}
      disabled={title.trim().length === 0 || kept.length === 0}
      error={error}
      onSubmit={() =>
        void run(
          () =>
            api.goals.create(workspaceId, {
              title: title.trim(),
              ...(description.trim() ? { description: description.trim() } : {}),
              successCriteria: kept,
              priority,
            }),
          (result) => {
            setOpen(false);
            setTitle("");
            setDescription("");
            setCriteria([""]);
            const goalId = (result as { goalId?: string } | undefined)?.goalId;
            router.push(goalId ? routes.goal(goalId) : routes.goals);
          },
        )
      }
    >
      <Field
        label="What do you want"
        value={title}
        onChange={setTitle}
        placeholder="Move authentication to OIDC"
        autoFocus
      />
      <Area
        label="In your own words"
        value={description}
        onChange={setDescription}
        rows={4}
        placeholder="We keep our own password login, but sessions must not be cut while the migration runs."
        hint="Context, constraints, what to avoid. This is handed to whoever works on it."
      />
      <Criteria
        label="Success means"
        values={criteria}
        onChange={setCriteria}
        placeholder="No session in progress is cut"
        hint="At least one. These are what a person checks before calling it done."
      />
      <div>
        <p className="label mb-1.5">Priority</p>
        <Segmented
          value={priority}
          onChange={setPriority}
          options={PRIORITIES.map((value) => ({ value, label: humanise(value) }))}
        />
      </div>
    </FormDialog>
  );
}

/**
 * A task is one piece of the need, assigned from its first instant.
 *
 * The assignee list is the workspace's members — people and agents alike,
 * because an agent is a member with a role like anybody else. §4.6 makes the
 * assignment mandatory: a task nobody owns is a task nobody does.
 */
export function NewTask({
  goal,
  members,
  trigger,
  onDone,
}: {
  goal: GoalView;
  members: MemberView[];
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<string[]>([""]);
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [repositoryId, setRepositoryId] = useState("");
  const { run, pending, error } = useAction();

  /**
   * §8.3 — the projects this workspace has, if it has any.
   *
   * Asked for here rather than passed in: this is the only form that needs
   * them, and a workspace with none simply shows no chooser rather than an
   * empty one.
   */
  const repositories = useResource(
    () => api.repositories.list(workspaceId),
    [workspaceId],
  );

  const kept = criteria.map((line) => line.trim()).filter(Boolean);
  const chosen = members.find(
    (member) => `${member.actorType}:${member.actorId}` === assignee,
  );

  return (
    <FormDialog
      trigger={trigger}
      title="New task"
      description={`One piece of “${goal.title}”, with its own definition of done.`}
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create the task"
      pending={pending}
      disabled={title.trim().length === 0 || kept.length === 0 || !chosen}
      error={error}
      onSubmit={() =>
        void run(
          () =>
            api.tasks.create(workspaceId, {
              goalId: goal.id,
              title: title.trim(),
              ...(description.trim() ? { description: description.trim() } : {}),
              acceptanceCriteria: kept,
              assigneeType: chosen!.actorType,
              assigneeId: chosen!.actorId,
              priority,
              // §8.3 — without this the machine gives the agent a bare
              // directory and no branch, which is what every task got before
              // repositories were carried through at all.
              ...(repositoryId ? { repositoryId } : {}),
            }),
          () => {
            setOpen(false);
            setTitle("");
            setDescription("");
            setCriteria([""]);
            onDone();
          },
        )
      }
    >
      <Field
        label="What has to be done"
        value={title}
        onChange={setTitle}
        placeholder="Write the OIDC adapter"
        autoFocus
      />
      <Area
        label="Details"
        value={description}
        onChange={setDescription}
        placeholder="The existing session store stays; only the identity source changes."
      />
      <Criteria
        label="Done means"
        values={criteria}
        onChange={setCriteria}
        placeholder="Tokens verified against the provider's JWKS"
        hint="Handed to the agent verbatim, and checked one by one at validation."
      />
      <div>
        <p className="label mb-1.5">Assign it to</p>
        {members.length === 0 ? (
          <Note>
            This workspace has no members yet. Add a person or create an agent
            in Workspace → People first.
          </Note>
        ) : (
          <Picker
            value={assignee}
            onChange={setAssignee}
            placeholder="Choose a person or an agent"
            options={members.map((member) => ({
              value: `${member.actorType}:${member.actorId}`,
              label:
                member.displayName ??
                member.email ??
                `${member.actorType.toLowerCase()} ${member.actorId.slice(0, 8)}`,
              hint: `${member.actorType.toLowerCase()} · ${humanise(member.role)}`,
            }))}
          />
        )}
      </div>
      <div>
        <p className="label mb-1.5">Priority</p>
        <Segmented
          value={priority}
          onChange={setPriority}
          options={PRIORITIES.map((value) => ({ value, label: humanise(value) }))}
        />
      </div>

      {/**
       * §8.3 — shown only when the workspace has projects. A chooser that is
       * always there and always empty teaches people to ignore it, and a
       * workspace whose work touches no code should not be asked about
       * repositories at all.
       */}
      {(repositories.data ?? []).length > 0 ? (
        <div>
          <p className="label mb-1.5">In which project</p>
          <Picker
            value={repositoryId}
            onChange={setRepositoryId}
            placeholder="No project — no branch, no checkout"
            options={[
              {
                value: "",
                label: "No project",
                hint: "the agent gets a working directory and nothing else",
              },
              ...(repositories.data ?? []).map((repository) => ({
                value: repository.id,
                label: repository.name,
                hint: `${repository.defaultBranch} · ${repository.localPath ?? repository.origin}`,
              })),
            ]}
          />
        </div>
      ) : null}
    </FormDialog>
  );
}

/* ── People and agents ───────────────────────────────────────────────────── */

export function InviteMember({ onDone }: { onDone: () => void }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("HUMAN_OPERATOR");
  const { run, pending, error } = useAction();

  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <UserPlus />
          Add a person
        </Button>
      }
      title="Add a person"
      description="They must already have an account on this hub — adding them here gives that account a role in this workspace."
      open={open}
      onOpenChange={setOpen}
      submitLabel="Add to workspace"
      pending={pending}
      disabled={email.trim().length === 0}
      error={error}
      onSubmit={() =>
        void run(
          () => api.members.invite(workspaceId, { role, email: email.trim() }),
          () => {
            setOpen(false);
            setEmail("");
            onDone();
          },
        )
      }
    >
      <Field
        label="Their email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="colleague@example.com"
        autoFocus
      />
      <RolePicker role={role} onChange={setRole} />
    </FormDialog>
  );
}

/**
 * §18.2 — bringing an agent into existence.
 *
 * Two steps in one, because they are useless apart: the organization issues
 * the identity, and the workspace gives it a role. The token is shown once —
 * only its hash is kept — so the dialog stays open on it until it has been
 * copied.
 */
/**
 * §18.2 — issuing an identity. An ORGANIZATION act.
 *
 * This used to create the identity AND grant it a role in whichever workspace
 * happened to be selected, which is why one form was mounted on two screens
 * and why an operator wanting the same agent in a second workspace ended up
 * with a second agent of the same name. The two acts are separate because the
 * two levels are: the organization owns the identity, a workspace lends it a
 * role (§18).
 */
export function NewAgent({ onDone }: { onDone: () => void }) {
  const organizationId = useOrganizationId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<{ token: string; actorId: string } | null>(null);
  const { run, pending, error } = useAction();

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setIssued(null);
      setName("");
      onDone();
    }
  };

  if (issued) {
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{name} exists</DialogTitle>
            <DialogDescription className="leading-relaxed">
              This token is shown once and is never retrievable again. It is
              how {name} authenticates — it holds no role anywhere yet, so give
              it one from the workspace it should work in.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="border-border bg-muted/50 flex items-center gap-2 rounded-lg border p-3">
              <code className="measure min-w-0 flex-1 truncate text-xs select-all">
                {issued.token}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigator.clipboard?.writeText(issued.token)}
              >
                <Copy />
                Copy
              </Button>
            </div>
            <Note tone="waiting">
              <TriangleAlert className="mr-1.5 inline size-3.5" />
              Anything holding this token acts as {name} in this organization.
              Put it where you would put a password.
            </Note>
          </div>

          <DialogFooter>
            <Button onClick={() => close(false)}>I have copied it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <Bot />
          Create an agent
        </Button>
      }
      title="Create an agent"
      description="An identity your organization owns. It can then be given a role in any of your workspaces — the same agent, in as many as you like."
      open={open}
      onOpenChange={close}
      submitLabel="Create the agent"
      pending={pending}
      disabled={!organizationId || name.trim().length === 0}
      error={error}
      onSubmit={() =>
        void run(
          async () => {
            const created = await api.actors.create(organizationId!, {
              actorType: "AGENT",
              displayName: name.trim(),
            });
            if (!created.ok) return created;
            setIssued({ token: created.value.token, actorId: created.value.actorId });
            return created;
          },
          () => undefined,
        )
      }
    >
      <Field
        label="What to call it"
        value={name}
        onChange={setName}
        placeholder="Reviewer"
        autoFocus
      />
      {!organizationId ? (
        <Note>Only an organization owner can create an agent.</Note>
      ) : null}
    </FormDialog>
  );
}

/**
 * §18 — lending one of the organization's agents to this workspace.
 *
 * The workspace half of the split above. It creates nothing: it picks an
 * identity the organization already holds and gives it a role here. An agent
 * already in this workspace is not offered — the list is what the
 * organization has MINUS what is already here, so the same agent cannot be
 * added twice and nobody has to remember who is where.
 */
export function AddAgentToWorkspace({
  members,
  onDone,
}: {
  members: MemberView[];
  onDone: () => void;
}) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const organizationId = useOrganizationId();
  const [open, setOpen] = useState(false);
  const [actorId, setActorId] = useState("");
  const [role, setRole] = useState<string>("AGENT_CONTRIBUTOR");
  const { run, pending, error } = useAction();

  const actors = useResource(
    () => api.actors.list(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) },
  );

  const here = new Set(members.map((member) => member.actorId));
  const available = (actors.data ?? []).filter(
    (actor) => actor.actorType === "AGENT" && !actor.revoked && !here.has(actor.actorId),
  );

  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <UserPlus />
          Add an agent
        </Button>
      }
      title="Add an agent to this workspace"
      description="One of your organization's agents, given a role here. Creating a new identity is done from the organization — the same agent can work in several workspaces."
      open={open}
      onOpenChange={setOpen}
      submitLabel="Give it the role"
      pending={pending}
      disabled={!actorId}
      error={error}
      onSubmit={() =>
        void run(
          () =>
            api.members.invite(workspaceId, {
              role,
              actorType: "AGENT",
              actorId,
            }),
          () => {
            setOpen(false);
            setActorId("");
            onDone();
          },
        )
      }
    >
      <div>
        <p className="label mb-1.5">Which agent</p>
        {available.length === 0 ? (
          <Note>
            Every agent your organization has is already in this workspace.
            Create another one from Organization → Agents.
          </Note>
        ) : (
          <Picker
            value={actorId}
            onChange={setActorId}
            placeholder="Choose one of your agents"
            options={available.map((actor) => ({
              value: actor.actorId,
              label: actor.displayName,
              hint: `issued ${actor.createdAt.slice(0, 10)}`,
            }))}
          />
        )}
      </div>
      <RolePicker role={role} onChange={setRole} />
    </FormDialog>
  );
}

/** The role, with what it actually permits printed underneath. */
function RolePicker({
  role,
  onChange,
}: {
  role: string;
  onChange: (role: string) => void;
}) {
  return (
    <div>
      <p className="label mb-1.5">Role</p>
      {/* Six roles with names like AGENT_CONTRIBUTOR do not fit on a row, and
          each needs a sentence anyway — the list carries them. */}
      <Picker
        value={role}
        onChange={onChange}
        options={WORKSPACE_ROLES.map((value) => ({
          value,
          label: humanise(value),
          hint: ROLE_MEANS[value],
        }))}
      />
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {ROLE_MEANS[role as keyof typeof ROLE_MEANS]}
      </p>
    </div>
  );
}

/**
 * The trigger every "create" button uses, so they read the same everywhere.
 *
 * It MUST forward the props it is handed. `DialogTrigger asChild` works by
 * cloning its child with an `onClick`, a ref and the aria wiring — a wrapper
 * that accepts only `children` drops all of it, and the button then looks
 * perfect and does nothing. Caught by a browser, never by the compiler.
 */
export function AddButton({
  children,
  ...forwarded
}: React.ComponentProps<typeof Button>) {
  return (
    <Button size="sm" {...forwarded}>
      <Plus />
      {children}
    </Button>
  );
}
