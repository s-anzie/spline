"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "@/lib/api/auth";
import type { User } from "@/lib/api/types";

type AuthState = {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  pending: boolean;
  error: string | null;
  setHydrated: (hydrated: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>()(persist((set) => ({
  token: null,
  user: null,
  hydrated: false,
  pending: false,
  error: null,
  setHydrated: (hydrated) => set({ hydrated }),
  clearError: () => set({ error: null }),
  login: async (email, password) => {
    set({ pending: true, error: null });
    try {
      const session = await authApi.login(email, password);
      set({ ...session, pending: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible";
      set({ pending: false, error: message });
      throw error;
    }
  },
  register: async (displayName, email, password) => {
    set({ pending: true, error: null });
    try {
      await authApi.register(displayName, email, password);
      const session = await authApi.login(email, password);
      set({ ...session, pending: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inscription impossible";
      set({ pending: false, error: message });
      throw error;
    }
  },
  logout: () => set({ token: null, user: null, error: null }),
}), {
  name: "spline-auth",
  partialize: ({ token, user }) => ({ token, user }),
  onRehydrateStorage: () => (state) => state?.setHydrated(true),
}));
