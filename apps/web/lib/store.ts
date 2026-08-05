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
 * Deliberately small: page data is fetched by the page that shows it rather
 * than mirrored here. A store that cached every list would need to know when
 * each one goes stale — and an operator's console showing a stale queue is
 * worse than one showing none, because it looks answered.
 */
export const useSession = create<SessionState>((set, get) => ({
  email: null,
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
    await get().refreshWorkspaces();
    set({ loading: false });
    return true;
  },

  logOut() {
    setAccessToken(null);
    set({
      email: null,
      userId: null,
      organizations: [],
      workspaces: [],
      workspaceId: null,
      error: null,
    });
  },

  chooseWorkspace(workspaceId) {
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
