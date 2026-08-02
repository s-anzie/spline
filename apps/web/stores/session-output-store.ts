import { create } from "zustand";

import { domainApi } from "@/lib/api/domains";
import type { SessionOutput } from "@/lib/api/types";
import { useAuthStore } from "./auth-store";

type State = {
  bySession: Record<string, SessionOutput[]>;
  loadingSessionId: string | null;
  error: string | null;
  load: (workspaceId: string, sessionId: string) => Promise<void>;
  append: (output: SessionOutput) => void;
};

export const useSessionOutputStore = create<State>((set) => ({
  bySession: {},
  loadingSessionId: null,
  error: null,
  load: async (workspaceId, sessionId) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    set({ loadingSessionId: sessionId, error: null });
    try {
      const outputs = await domainApi.sessionOutputs(
        workspaceId,
        sessionId,
        token,
      );
      set((state) => ({
        bySession: {
          ...state.bySession,
          // A realtime chunk can arrive while the initial HTTP request is in
          // flight. Merge both sources so the slower response never erases it.
          [sessionId]: [...outputs, ...(state.bySession[sessionId] ?? [])]
            .filter(
              (output, index, all) =>
                all.findIndex((candidate) => candidate.id === output.id) ===
                index,
            )
            .sort((left, right) => left.sequence - right.sequence),
        },
      }));
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Sortie indisponible",
      });
    } finally {
      set({ loadingSessionId: null });
    }
  },
  append: (output) =>
    set((state) => {
      const current = state.bySession[output.sessionId] ?? [];
      if (current.some((item) => item.id === output.id)) return state;
      return {
        bySession: {
          ...state.bySession,
          [output.sessionId]: [...current, output].sort(
            (left, right) => left.sequence - right.sequence,
          ),
        },
      };
    }),
}));
