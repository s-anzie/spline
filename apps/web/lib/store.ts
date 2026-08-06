"use client";

import { create } from "zustand";

import { hub, setAccessToken } from "./hub";

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
  loading: boolean;
  error: string | null;

  logIn(email: string, password: string): Promise<boolean>;
  logOut(): void;
  chooseWorkspace(workspaceId: string | null): void;
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
  loading: false,
  error: null,

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
    set({ email, userId: logged.value.userId });
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

  logOut() {
    setAccessToken(null);
    set({
      email: null,
      displayName: null,
      userId: null,
      organizations: [],
      workspaces: [],
      workspaceId: null,
      error: null,
    });
  },

  chooseWorkspace(workspaceId) {
    // The caller sends the browser back to the queue afterwards: a run id from
    // the previous workspace resolves to nothing here, and asking for it is
    // the cross-workspace read §4.2 forbids outright.
    set({ workspaceId });
  },

  async refreshWorkspaces() {
    const [organizations, workspaces] = await Promise.all([
      hub.get<Organization[]>("/organizations"),
      hub.get<Workspace[]>("/workspaces"),
    ]);
    set({
      organizations: organizations.ok ? organizations.value : [],
      workspaces: workspaces.ok ? workspaces.value : [],
      // Chosen for them when there is only one: a console that made an
      // operator pick from a list of one is a console that wastes a click
      // every time.
      workspaceId:
        get().workspaceId ??
        (workspaces.ok && workspaces.value.length === 1
          ? (workspaces.value[0]?.id ?? null)
          : null),
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
}

/**
 * Choices about the console itself, kept apart from the session.
 *
 * Separate store because these outlive a sign-out: changing workspace or user
 * should not silently reset how dense somebody likes their lists.
 */
export const usePreferences = create<PreferenceState>((set) => ({
  pageSize: 25,
  setPageSize: (pageSize) => set({ pageSize }),
  organizationInRail: false,
  setOrganizationInRail: (organizationInRail) => set({ organizationInRail }),
}));

/** The organization the console acts on behalf of. One, in practice. */
export function useOrganizationId(): string | null {
  return useSession((state) => state.organizations[0]?.id ?? null);
}
