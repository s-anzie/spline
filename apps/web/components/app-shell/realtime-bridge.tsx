"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanningStore } from "@/stores/planning-store";
import { useRealtimeStore } from "@/stores/realtime-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSessionOutputStore } from "@/stores/session-output-store";
import type { AgentSession, SessionOutput } from "@/lib/api/types";
import { useNotificationStore } from "@/stores/notification-store";

const SOCKET_URL=process.env.NEXT_PUBLIC_SPLINE_SOCKET_URL??"http://localhost:8765";

const SILENT_SYNC_INTERVAL_MS = 6000;
const ACTIVE_SESSION_SYNC_INTERVAL_MS = 2500;

export function RealtimeBridge({ workspaceId }: { workspaceId?: string }){
  const token=useAuthStore((state)=>state.token);
  useEffect(()=>{
    if(!token)return;
    const socket=io(SOCKET_URL,{auth:{token},transports:["websocket","polling"]});
    let refreshTimer:number|undefined;
    socket.on("connect",()=>useRealtimeStore.getState().setConnected(true));
    socket.on("disconnect",()=>useRealtimeStore.getState().setConnected(false));
    socket.onAny((event:string,payload:{workspaceId?:string;sessionId?:string;to?:string;output?:SessionOutput})=>{
      useRealtimeStore.getState().setLastEvent(event);
      if (event.startsWith("notification."))
        void useNotificationStore.getState().load(true);
      if(event==="session.output"&&payload?.output){
        useSessionOutputStore.getState().append(payload.output);
        return;
      }
      if (
        event === "agent_session.status_changed" &&
        payload?.sessionId &&
        payload?.to
      ) {
        useWorkspaceDomainStore.getState().applySessionStatus(
          payload.sessionId,
          payload.to as AgentSession["status"],
        );
      }
      window.clearTimeout(refreshTimer);
      refreshTimer=window.setTimeout(()=>{
        const workspaceId=payload?.workspaceId;
        if(event.startsWith("workspace."))void useWorkspaceStore.getState().loadWorkspaces(true);
        if(workspaceId&&(event.startsWith("goal.")||event.startsWith("task.")))void usePlanningStore.getState().load(workspaceId,true);
        if(workspaceId&&!event.startsWith("goal.")&&!event.startsWith("task.")&&!event.startsWith("workspace."))void useWorkspaceDomainStore.getState().load(workspaceId,true);
      },180);
    });
    return()=>{window.clearTimeout(refreshTimer);socket.disconnect();useRealtimeStore.getState().setConnected(false);};
  },[token]);

  useEffect(() => {
    if (!token || !workspaceId) return;
    const refreshActiveSessions = () => {
      if (document.visibilityState === "hidden") return;
      const state = useWorkspaceDomainStore.getState();
      const hasExecutingSession = state.sessions.some((session) =>
        ["STARTING", "RUNNING", "AWAITING_APPROVAL"].includes(session.status),
      );
      if (hasExecutingSession) void state.refreshSessions(workspaceId);
    };
    const interval = window.setInterval(
      refreshActiveSessions,
      ACTIVE_SESSION_SYNC_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [token, workspaceId]);

  useEffect(() => {
    if (!token) return;
    let syncing = false;
    let disposed = false;
    const sync = async () => {
      if (syncing || disposed || document.visibilityState === "hidden") return;
      syncing = true;
      try {
        if (workspaceId) {
          await Promise.all([
            useWorkspaceDomainStore.getState().load(workspaceId, true),
            usePlanningStore.getState().load(workspaceId, true),
          ]);
        } else {
          await useWorkspaceStore.getState().loadWorkspaces(true);
        }
        await useNotificationStore.getState().load(true);
      } finally {
        syncing = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const interval = window.setInterval(() => void sync(), SILENT_SYNC_INTERVAL_MS);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    void sync();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, workspaceId]);
  return null;
}
