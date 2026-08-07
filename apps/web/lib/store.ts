"use client";

import { useMemo } from "react";

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { hub, setAccessToken, setTokenRenewal } from "./hub";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Workspace {
  /**
   * `id`, not `workspaceId`. The CREATION route answers with `workspaceId`
   * and the list route with `id`, and assuming they matched produced a list
   * of keyless rows — caught by a browser, never by the compiler, because
   * both are strings.
   */
  id: string;
  name: string;
  status: string;
  /**
   * §4.1 — which organization this belongs to.
   *
   * Carried so the console can show one organization's workspaces rather than
   * every workspace this account can reach. The hub has always answered with
   * it; nothing read it while the console assumed a person owned exactly one
   * organization.
   */
  organizationId: string;
}

interface SessionState {
  email: string | null;
  /** What this person is called. `/auth/me` knows it; the login reply does not. */
  displayName: string | null;
  userId: string | null;
  organizations: Organization[];
  workspaces: Workspace[];
  /** The workspace every screen is scoped to. §4.2 makes this mandatory. */
  workspaceId: string | null;
  /**
   * §4.1 — the organization the console is acting inside.
   *
   * Every screen used to read `organizations[0]`, which was true for as long
   * as there was no way to make a second one. Now that founding one is a
   * route, an organization nobody could switch to would be an organization
   * nobody could use.
   */
  organizationId: string | null;
  loading: boolean;
  error: string | null;
  /**
   * Whether the one attempt to pick a session back up has finished.
   *
   * Without it the console cannot tell "signed out" from "not asked yet", and
   * every reload would flash the sign-in page for the length of one request
   * before landing on the queue.
   */
  restored: boolean;

  logIn(email: string, password: string): Promise<boolean>;
  logOut(): Promise<void>;
  restore(): Promise<void>;
  chooseWorkspace(workspaceId: string | null): void;
  chooseOrganization(organizationId: string): void;
  refreshWorkspaces(): Promise<void>;
}

/**
 * The session, and nothing else.
 *
 * Deliberately small: page data is fetched by the screen that shows it rather
 * than mirrored here. A store that cached every list would need to know when
 * each one goes stale — and an operator's console showing a stale queue is
 * worse than one showing none, because it looks answered.
 */
export const useSession = create<SessionState>((set, get) => ({
  email: null,
  displayName: null,
  userId: null,
  organizations: [],
  workspaces: [],
  workspaceId: null,
  organizationId: null,
  loading: false,
  error: null,
  restored: false,

  async logIn(email, password) {
    set({ loading: true, error: null });
    const logged = await hub.post<{ accessToken: string; userId: string }>(
      "/auth/login",
      { email, password },
    );
    if (!logged.ok) {
      set({ loading: false, error: logged.error.message });
      return false;
    }

    setAccessToken(logged.value.accessToken);
    set({ email, userId: logged.value.userId, restored: true });
    // Who this is, in their own words. Asked separately because signing in
    // answers with an id and a token, which is all it should answer with.
    const me = await hub.get<{ displayName: string | null }>("/auth/me");
    if (me.ok) {
      set({ displayName: me.value.displayName });
    }
    await get().refreshWorkspaces();
    set({ loading: false });
    return true;
  },

  /**
   * Signing out has to reach the hub now: the cookie lives there, and
   * forgetting the token in this tab would leave a session that the next
   * reload would happily pick back up.
   */
  async logOut() {
    await hub.post("/auth/logout");
    setAccessToken(null);
    usePreferences.getState().rememberWorkspace(null);
    set({
      email: null,
      displayName: null,
      userId: null,
      organizations: [],
      workspaces: [],
      workspaceId: null,
      error: null,
      restored: true,
    });
  },

  /**
   * §18 — pick the session back up after a reload.
   *
   * The cookie does this, not a stored token: the console cannot read it, and
   * the hub rotates it on every use, so a copy of it stops working the moment
   * this browser comes back. A failure here is the normal case for anybody
   * who is simply not signed in, so it sets no error — it just finishes.
   */
  async restore() {
    if (get().restored) {
      return;
    }
    set({ loading: true });
    const renewed = await hub.post<{ accessToken: string; userId: string }>(
      "/auth/refresh",
    );
    if (!renewed.ok) {
      set({ loading: false, restored: true });
      return;
    }
    setAccessToken(renewed.value.accessToken);
    set({ userId: renewed.value.userId });

    const me = await hub.get<{ displayName: string | null; email: string | null }>(
      "/auth/me",
    );
    if (me.ok) {
      set({ displayName: me.value.displayName, email: me.value.email });
    }
    await get().refreshWorkspaces();
    set({ loading: false, restored: true });
  },

  /**
   * Switching organization drops the workspace with it: a workspace of the
   * other organization is not reachable from here, and keeping it selected
   * would put every screen in the cross-workspace read §4.2 forbids.
   */
  chooseOrganization(organizationId) {
    const first = get().workspaces.find(
      (workspace) => workspace.organizationId === organizationId,
    );
    set({ organizationId, workspaceId: first?.id ?? null });
    usePreferences.getState().rememberOrganization(organizationId);
    usePreferences.getState().rememberWorkspace(first?.id ?? null);
  },

  chooseWorkspace(workspaceId) {
    // The caller sends the browser back to the queue afterwards: a run id from
    // the previous workspace resolves to nothing here, and asking for it is
    // the cross-workspace read §4.2 forbids outright.
    set({ workspaceId });
    usePreferences.getState().rememberWorkspace(workspaceId);
  },

  async refreshWorkspaces() {
    const [organizations, workspaces] = await Promise.all([
      hub.get<Organization[]>("/organizations"),
      hub.get<Workspace[]>("/workspaces"),
    ]);
    const owned = organizations.ok ? organizations.value : [];
    const all = workspaces.ok ? workspaces.value : [];
    // Chosen for them when there is only one: a console that made an operator
    // pick from a list of one is a console that wastes a click every time.
    const organizationId =
      chooseFrom(owned, get().organizationId, usePreferences.getState().lastOrganizationId) ??
      /**
       * Unlike a workspace, an organization is never left unchosen. §4.2 makes
       * picking a workspace a deliberate act because its screens are scoped to
       * it; an organization with none chosen would simply render nothing —
       * including the machines screen, which is where somebody goes to pair
       * the first machine.
       */
      owned[0]?.id ??
      null;
    // Only this organization's workspaces are selectable — the others exist,
    // but not from where the reader is standing.
    const here = organizationId
      ? all.filter((workspace) => workspace.organizationId === organizationId)
      : all;
    set({
      organizations: owned,
      workspaces: all,
      organizationId,
      workspaceId: chooseFrom(
        here,
        get().workspaceId,
        usePreferences.getState().lastWorkspaceId,
      ),
    });
  },
}));

interface PreferenceState {
  /** How many rows a list shows before it pages. One setting, every screen. */
  pageSize: number;
  setPageSize(size: number): void;
  /**
   * Whether the organization's own entries also sit in the workspace rail.
   *
   * Off by default: the organization is a place you visit — to pair a machine,
   * to issue an agent — not something you consult twenty times a day, and a
   * rail that shows everything shows nothing. On, for whoever runs the fleet
   * and wants both levels in one glance.
   */
  organizationInRail: boolean;
  setOrganizationInRail(shown: boolean): void;
  /**
   * The workspace this browser was last working in.
   *
   * Not a secret and not a permission — it is a bookmark. Which one you may
   * open is decided by the hub on every read; this only spares somebody the
   * picker after a reload. It is checked against what the hub actually
   * returns before being used, so a stale one, or one belonging to whoever
   * used this browser before, simply does not match and is dropped.
   */
  lastWorkspaceId: string | null;
  rememberWorkspace(workspaceId: string | null): void;
  lastOrganizationId: string | null;
  rememberOrganization(organizationId: string | null): void;
}

/**
 * Choices about the console itself, kept apart from the session.
 *
 * Separate store because these outlive a sign-out: changing workspace or user
 * should not silently reset how dense somebody likes their lists. They now
 * outlive the TAB as well — a setting that had to be re-applied after every
 * reload was, in practice, a setting nobody kept.
 *
 * In `localStorage`, deliberately, and note the contrast with the access
 * token two files over: that one is kept in memory precisely so no script on
 * this origin can read it. Nothing here is a secret — a page size and whether
 * a column shows five more links. Storing preferences where a token must
 * never go is the whole reason these are two stores and not one.
 */
export const usePreferences = create<PreferenceState>()(
  persist(
    (set) => ({
      pageSize: 25,
      setPageSize: (pageSize) => set({ pageSize }),
      organizationInRail: false,
      setOrganizationInRail: (organizationInRail) => set({ organizationInRail }),
      lastWorkspaceId: null,
      rememberWorkspace: (lastWorkspaceId) => set({ lastWorkspaceId }),
      lastOrganizationId: null,
      rememberOrganization: (lastOrganizationId) => set({ lastOrganizationId }),
    }),
    {
      name: "spline.preferences",
      storage: createJSONStorage(() => localStorage),
      // Only the values. Rehydrating the setters would replace the live
      // functions with whatever JSON round-tripped to — which is nothing.
      partialize: (state) => ({
        pageSize: state.pageSize,
        organizationInRail: state.organizationInRail,
        lastWorkspaceId: state.lastWorkspaceId,
      }),
      // Hydration is deferred to `useRestorePreferences` below; see there.
      skipHydration: true,
    },
  ),
);

/**
 * Read the stored preferences back, once, after the first paint.
 *
 * Not at store creation, which is what `persist` does by default. This page
 * is server-rendered before it is hydrated, and the server has no
 * `localStorage`: a store that came up already holding "show the organization
 * in the rail" would render a rail the server's HTML does not contain, and
 * React would throw the whole tree away and re-render it client-side to
 * recover. So the first client render matches the server exactly, and the
 * stored values land one frame later.
 */
export function useRestorePreferences(): void {
  useEffect(() => {
    void usePreferences.persist.rehydrate();
  }, []);
}

/**
 * Which workspace to open on, given what the hub says this person has.
 *
 * Order matters and each step earns its place: what is already chosen wins,
 * because a running session must not be moved under somebody's feet; then the
 * one this browser was last in, so a reload lands where they left off; then
 * the only one there is, because a picker with one entry wastes a click every
 * time. Anything the hub did not return is dropped — a remembered id from
 * another account matches nothing and falls through.
 */
/**
 * Keep what is still valid, else what was remembered, else the only one there
 * is. Written over `{ id }` rather than `Workspace` because organizations
 * choose themselves the same way, and two copies of this would drift.
 */
function chooseFrom(
  options: readonly { id: string }[],
  current: string | null,
  remembered: string | null,
): string | null {
  const has = (id: string | null) =>
    Boolean(id) && options.some((option) => option.id === id);
  if (has(current)) return current;
  if (has(remembered)) return remembered;
  return options.length === 1 ? (options[0]?.id ?? null) : null;
}

/**
 * What `lib/hub.ts` calls when a request comes back 401.
 *
 * Registered here rather than imported there: the client is the bottom of the
 * stack and must not know about the store. Returns whether the console is
 * still signed in, so a caller can replay its request or give up.
 */
setTokenRenewal(async () => {
  const renewed = await hub.post<{ accessToken: string; userId: string }>(
    "/auth/refresh",
  );
  if (!renewed.ok) {
    setAccessToken(null);
    useSession.setState({
      email: null,
      displayName: null,
      userId: null,
      organizations: [],
      workspaces: [],
      workspaceId: null,
      organizationId: null,
      restored: true,
    });
    return false;
  }
  setAccessToken(renewed.value.accessToken);
  return true;
});

/** The organization the console is acting inside. */
export function useOrganizationId(): string | null {
  return useSession((state) => state.organizationId);
}

/**
 * The same one, whole. Every screen that used `organizations[0]` wants this.
 *
 * `find` returns a reference the store already holds, so unlike the list
 * above this is stable and may stay in the selector.
 */
export function useOrganization(): Organization | null {
  return useSession(
    (state) =>
      state.organizations.find((entry) => entry.id === state.organizationId) ?? null,
  );
}

/**
 * The workspaces of the organization the console is inside — never all of them.
 *
 * Derived in a memo rather than inside the selector. A Zustand selector that
 * builds a new array every call returns a new reference every render, and the
 * store re-renders on every new reference: React tore the console down with
 * "Maximum update depth exceeded" the moment this shipped. The selector must
 * return what the store already holds; the filtering happens after.
 */
export function useWorkspacesHere(): Workspace[] {
  const workspaces = useSession((state) => state.workspaces);
  const organizationId = useSession((state) => state.organizationId);
  return useMemo(
    () =>
      organizationId
        ? workspaces.filter((workspace) => workspace.organizationId === organizationId)
        : workspaces,
    [workspaces, organizationId],
  );
}
