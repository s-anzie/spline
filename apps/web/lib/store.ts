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

export type Screen =
  | "queue"
  | "goals"
  | "tasks"
  | "runs"
  | "machines"
  | "activity"
  | "inbox"
  | "workspace";

/**
 * Where the console is looking. `id` is the thing being drilled into — a run,
 * a task — and `null` is the list.
 *
 * Navigation lives in the store rather than in the URL because the access
 * token is held in memory (see `hub.ts`): a deep link would hand somebody a
 * screen that cannot load, then bounce them to sign-in and lose the place
 * they were pointed at. One address, one session, no dead links.
 */
export interface Route {
  screen: Screen;
  id: string | null;
}

interface SessionState {
  email: string | null;
  userId: string | null;
  organizations: Organization[];
  workspaces: Workspace[];
  /** The workspace every screen is scoped to. §4.2 makes this mandatory. */
  workspaceId: string | null;
  route: Route;
  loading: boolean;
  error: string | null;

  logIn(email: string, password: string): Promise<boolean>;
  logOut(): void;
  chooseWorkspace(workspaceId: string | null): void;
  go(screen: Screen, id?: string | null): void;
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
  userId: null,
  organizations: [],
  workspaces: [],
  workspaceId: null,
  route: { screen: "queue", id: null },
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
      route: { screen: "queue", id: null },
      error: null,
    });
  },

  chooseWorkspace(workspaceId) {
    // Back to the queue: a run id from the previous workspace would resolve
    // to nothing here, and asking for it is the cross-workspace read §4.2
    // forbids outright.
    set({ workspaceId, route: { screen: "queue", id: null } });
  },

  go(screen, id = null) {
    set({ route: { screen, id } });
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

/** The organization the console acts on behalf of. One, in practice. */
export function useOrganizationId(): string | null {
  return useSession((state) => state.organizations[0]?.id ?? null);
}
