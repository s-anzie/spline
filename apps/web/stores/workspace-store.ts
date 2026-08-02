"use client";

import { create } from "zustand";
import { workspaceApi } from "@/lib/api/workspaces";
import type { CreateWorkspaceInput, Workspace } from "@/lib/api/types";
import { useAuthStore } from "./auth-store";

type WorkspaceState = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  setActiveWorkspace: (workspaceId: string | null) => void;
  loadWorkspaces: (force?: boolean) => Promise<void>;
  createWorkspace: (
    input: CreateWorkspaceInput & { rootPath?: string },
  ) => Promise<Workspace>;
  updateWorkspace: (
    id: string,
    action: "rename" | "rootPath" | "ruleset" | "archive" | "duplicate",
    value?: string,
  ) => Promise<Workspace>;
  updateIdentity: (
    id: string,
    input: { name: string; description: string },
  ) => Promise<Workspace>;
  reset: () => void;
};

function requireToken() {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error("Session requise");
  return token;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  loading: false,
  initialized: false,
  error: null,
  setActiveWorkspace: (activeWorkspaceId) => set({ activeWorkspaceId }),
  loadWorkspaces: async (force = false) => {
    if ((get().loading || get().initialized) && !force) return;
    set({ loading: true, error: null });
    try {
      const workspaces = await workspaceApi.list(requireToken());
      set({ workspaces, loading: false, initialized: true });
    } catch (error) {
      set({
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : "Chargement impossible",
      });
    }
  },
  createWorkspace: async (input) => {
    set({ loading: true, error: null });
    try {
      const workspace = await workspaceApi.create(
        { name: input.name, description: input.description },
        requireToken(),
      );
      set((state) => ({
        workspaces: [workspace, ...state.workspaces],
        activeWorkspaceId: workspace.id,
        loading: false,
      }));
      return workspace;
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Création impossible",
      });
      throw error;
    }
  },
  updateWorkspace: async (id, action, value) => {
    set({ loading: true, error: null });
    try {
      const token = requireToken();
      let workspace: Workspace;
      if (action === "rename")
        workspace = await workspaceApi.rename(id, value ?? "", token);
      else if (action === "rootPath")
        workspace = await workspaceApi.rootPath(id, value ?? "", token);
      else if (action === "ruleset") {
        let ruleset: Record<string, unknown>;
        try {
          ruleset = JSON.parse(value ?? "{}") as Record<string, unknown>;
        } catch {
          throw new Error("Le ruleset doit être un objet JSON valide.");
        }
        workspace = await workspaceApi.ruleset(id, ruleset, token);
      } else if (action === "archive")
        workspace = await workspaceApi.archive(id, token);
      else
        workspace = await workspaceApi.duplicate(id, value ?? "Copie", token);
      set((state) => ({
        workspaces:
          action === "duplicate"
            ? [workspace, ...state.workspaces]
            : state.workspaces
                .map((item) => (item.id === id ? workspace : item))
                .filter((item) => item.status !== "ARCHIVED"),
        loading: false,
      }));
      return workspace;
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Action impossible",
      });
      throw error;
    }
  },
  updateIdentity: async (id, input) => {
    set({ loading: true, error: null });
    try {
      const workspace = await workspaceApi.updateIdentity(
        id,
        input,
        requireToken(),
      );
      set((state) => ({
        workspaces: state.workspaces.map((item) =>
          item.id === id ? workspace : item,
        ),
        loading: false,
      }));
      return workspace;
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Modification impossible",
      });
      throw error;
    }
  },
  reset: () =>
    set({
      workspaces: [],
      activeWorkspaceId: null,
      initialized: false,
      error: null,
    }),
}));
