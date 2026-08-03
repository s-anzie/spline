import { create } from "zustand";

import { domainApi } from "@/lib/api/domains";
import type { Notification, NotificationRecipient } from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";

export type InboxItem = {
  notification: Notification;
  recipient: NotificationRecipient;
};

type NotificationState = {
  items: InboxItem[];
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  advance: (item: InboxItem, status: string) => Promise<void>;
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  load: async (force = false) => {
    if (get().loading && !force) return;
    const { token, user } = useAuthStore.getState();
    if (!token || !user) return;
    set({ loading: true, error: null });
    try {
      set({
        items: await domainApi.unreadNotifications(user.id, token),
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Chargement impossible",
      });
    }
  },
  advance: async (item, status) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const recipient = await domainApi.advanceNotification(
        item.notification.workspaceId,
        item.notification.id,
        status,
        token,
      );
      set((state) => ({
        error: null,
        items:
          status === "ACTED_ON"
            ? state.items.filter(
                ({ notification }) => notification.id !== item.notification.id,
              )
            : state.items.map((current) =>
                current.notification.id === item.notification.id
                  ? { ...current, recipient }
                  : current,
              ),
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Action impossible" });
      throw error;
    }
  },
}));
