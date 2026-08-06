"use client";

import { useEffect, useState } from "react";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePreferences, useSession } from "@/lib/store";
import { useAction } from "@/lib/use-hub";
import { Field, Id, Note, PageHeader, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Everything that belongs to the account rather than to a workspace.
 *
 * Kept apart on purpose. A menu is for going somewhere and for reading what
 * is currently true; editing inside one gives a text field the lifetime of a
 * hover, and buries settings where nobody looks for them twice. Workspace
 * settings live on the workspace screen, where their scope is obvious.
 */
export function Settings() {
  return (
    <>
      <PageHeader
        title="Settings"
        lead="Your account, and the organization it owns. Anything scoped to one workspace lives on that workspace's own screen."
      />
      <Profile />
      <OrganizationSettings />
      <Appearance />
      <Console />
      <SessionNote />
    </>
  );
}

/** A row: what it is on the left, what it does on the right. */
function Setting({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 py-4 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{hint}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <Card className="divide-border gap-0 divide-y px-5 py-0 shadow-none">{children}</Card>
  );
}

function Profile() {
  const { email, displayName, userId, refreshWorkspaces } = useSession();
  const [name, setName] = useState("");
  const { run, pending, error } = useAction();

  // Seeded from the session once it has loaded, not on every render: typing
  // would otherwise be overwritten by the next poll.
  useEffect(() => {
    if (displayName) setName(displayName);
  }, [displayName]);

  return (
    <Section title="You">
      <Panel>
        <Setting
          label="Your name"
          hint="What every member list, thread and assigned task shows. Correcting it here corrects it everywhere."
        >
          <form
            className="flex max-w-md items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => api.auth.rename(name.trim()), async () => {
                // The session holds the name the rail renders.
                useSession.setState({ displayName: name.trim() });
                await refreshWorkspaces();
              });
            }}
          >
            <Field label="Name" value={name} onChange={setName} className="flex-1" />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !name.trim() || name.trim() === displayName}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </form>
          {error ? (
            <div className="mt-3 max-w-md">
              <Note>{error}</Note>
            </div>
          ) : null}
        </Setting>

        <Setting
          label="Email"
          hint="What you sign in with. Moving it needs proof of the new address before it starts working, so it is not something this screen can do yet."
        >
          <p className="measure text-muted-foreground py-2 text-sm">{email}</p>
        </Setting>

        <Setting label="Account id" hint="Ask for it when somebody needs to point at you.">
          <div className="py-1.5">
            <Id value={userId} full />
          </div>
        </Setting>
      </Panel>
    </Section>
  );
}

/**
 * §18 — the organization owns the machines, the agents and every workspace.
 *
 * It is created at sign-up from the person's own name, which is a reasonable
 * default and a poor label the moment a colleague joins.
 */
function OrganizationSettings() {
  const organization = useSession((state) => state.organizations[0]);
  const refresh = useSession((state) => state.refreshWorkspaces);
  const workspaces = useSession((state) => state.workspaces);
  const [name, setName] = useState("");
  const { run, pending, error } = useAction();

  useEffect(() => {
    if (organization) setName(organization.name);
  }, [organization]);

  if (!organization) {
    return (
      <Section title="Organization">
        <Note>
          You do not own an organization. Machines and agents belong to one, so
          somebody who does has to add you.
        </Note>
      </Section>
    );
  }

  return (
    <Section title="Organization">
      <Panel>
        <Setting
          label="Name"
          hint="Owns your machines, your agents and every workspace. Shown wherever this account's fleet is."
        >
          <form
            className="flex max-w-md items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => api.organizations.rename(organization.id, name.trim()),
                () => void refresh(),
              );
            }}
          >
            <Field label="Name" value={name} onChange={setName} className="flex-1" />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !name.trim() || name.trim() === organization.name}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </form>
          {error ? (
            <div className="mt-3 max-w-md">
              <Note>{error}</Note>
            </div>
          ) : null}
        </Setting>

        <Setting
          label="Organization id"
          hint="A machine is configured with this so it knocks here and appears in your list, and in nobody else's."
        >
          <div className="py-1.5">
            <Id value={organization.id} full />
          </div>
        </Setting>

        <Setting label="Workspaces" hint="Everything below the organization.">
          <p className="text-muted-foreground py-2 text-sm">
            {workspaces.length === 0
              ? "none yet"
              : workspaces.map((workspace) => workspace.name).join(", ")}
          </p>
        </Setting>
      </Panel>
    </Section>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // `theme` is undefined until the client resolves it; rendering a selection
  // before then briefly marks the wrong one.
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: "Light", icon: Sun, hint: "for a bright room" },
    { value: "dark", label: "Dark", icon: Moon, hint: "the default here" },
    { value: "system", label: "System", icon: Monitor, hint: "follow the machine" },
  ];

  return (
    <Section title="Appearance">
      <Panel>
        <Setting
          label="Theme"
          hint="Remembered on this device. The console is dark by default because it tends to sit open on a second monitor."
        >
          <div className="grid max-w-md gap-2 py-1 sm:grid-cols-3">
            {options.map((option) => {
              const active = mounted && theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-signal bg-accent"
                      : "border-border hover:border-foreground/25",
                  )}
                >
                  <option.icon
                    className={cn("size-4", active ? "text-signal" : "text-muted-foreground")}
                    strokeWidth={1.75}
                  />
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-muted-foreground text-xs">{option.hint}</span>
                </button>
              );
            })}
          </div>
        </Setting>
      </Panel>
    </Section>
  );
}

/** How the console itself is laid out. Nothing here reaches the hub. */
function Console() {
  const { pageSize, setPageSize, organizationInRail, setOrganizationInRail } =
    usePreferences();

  return (
    <Section title="Console">
      <Panel>
        <Setting
          label="Organization in the sidebar"
          hint="The organization has its own space, reached from your account menu. Turn this on to keep its machines and agents in the sidebar as well, above the workspace — for whoever runs the fleet and wants both levels at a glance. Workspaces and settings are not repeated there: the switcher and this menu already stand for them. Remembered on this device."
        >
          <div className="flex items-center gap-3 py-1">
            <Button
              variant={organizationInRail ? "default" : "outline"}
              size="sm"
              onClick={() => setOrganizationInRail(true)}
            >
              Show it
            </Button>
            <Button
              variant={organizationInRail ? "outline" : "default"}
              size="sm"
              onClick={() => setOrganizationInRail(false)}
            >
              Keep it separate
            </Button>
          </div>
        </Setting>

        <Setting
          label="Rows per page"
          hint="Every list uses this, and it is remembered on this device. Lists shorter than the smallest page show no pager at all."
        >
          <div className="flex flex-wrap gap-2 py-1">
            {[10, 25, 50, 100, 250].map((size) => (
              <Button
                key={size}
                variant={pageSize === size ? "default" : "outline"}
                size="sm"
                className="measure"
                onClick={() => setPageSize(size)}
              >
                {size}
              </Button>
            ))}
          </div>
        </Setting>
      </Panel>
    </Section>
  );
}

function SessionNote() {
  const logOut = useSession((state) => state.logOut);

  return (
    <Section title="Session">
      <Panel>
        <Setting
          label="How this session works"
          hint="Two credentials, and the split is the point. The token that can actually do things lives in this tab's memory and never touches local storage — one any script on this origin could read turns a single XSS into a full takeover. What survives a reload is a cookie this console cannot read either, good for one thing: asking the hub for a new token. The hub replaces it on every use, so a copy of it stops working the moment you come back."
        >
          <div className="py-1">
            <Button variant="outline" size="sm" onClick={() => void logOut()}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </Setting>
      </Panel>
    </Section>
  );
}
