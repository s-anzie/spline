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
import { useAction } from "@/lib/use-hub";
import { Area, Criteria, Field, Note, Segmented } from "@/components/kit";
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
  const { run, pending, error } = useAction();

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
          <Segmented
            value={assignee}
            onChange={setAssignee}
            options={members.map((member) => ({
              value: `${member.actorType}:${member.actorId}`,
              label:
                member.displayName ??
                member.email ??
                `${member.actorType.toLowerCase()} ${member.actorId.slice(0, 8)}`,
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
export function NewAgent({ onDone }: { onDone: () => void }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const organizationId = useOrganizationId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("AGENT_CONTRIBUTOR");
  const [issued, setIssued] = useState<{ token: string; actorId: string } | null>(null);
  const { run, pending, error } = useAction();

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setIssued(null);
      setName("");
    }
  };

  if (issued) {
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{name} is ready</DialogTitle>
            <DialogDescription className="leading-relaxed">
              This token is shown once. The hub keeps only its hash — if it is
              lost, issue a new one and revoke this.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="bg-muted flex items-start gap-2 rounded-md p-3">
              <code className="measure min-w-0 flex-1 text-xs break-all">
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
      description="An agent is a member like a person: it holds a name, a role, and a credential of its own. Work is assigned to it by name."
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
            // An identity with no role in any workspace can do nothing at all,
            // so the membership is part of creating it, not a second errand.
            const joined = await api.members.invite(workspaceId, {
              role,
              actorType: "AGENT",
              actorId: created.value.actorId,
            });
            if (!joined.ok) return joined;
            setIssued({ token: created.value.token, actorId: created.value.actorId });
            return created;
          },
          onDone,
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
      <RolePicker role={role} onChange={setRole} />
      {!organizationId ? (
        <Note>Only an organization owner can create an agent.</Note>
      ) : null}
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
      <Segmented
        value={role}
        onChange={onChange}
        options={WORKSPACE_ROLES.map((value) => ({ value, label: humanise(value) }))}
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
