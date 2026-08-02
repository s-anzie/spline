"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanningStore } from "@/stores/planning-store";
import { useRealtimeStore } from "@/stores/realtime-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSessionOutputStore } from "@/stores/session-output-store";
import type { SessionOutput } from "@/lib/api/types";

const SOCKET_URL=process.env.NEXT_PUBLIC_SPLINE_SOCKET_URL??"http://localhost:8765";

export function RealtimeBridge(){
  const token=useAuthStore((state)=>state.token);
  useEffect(()=>{
    if(!token)return;
    const socket=io(SOCKET_URL,{auth:{token},transports:["websocket","polling"]});
    let refreshTimer:number|undefined;
    socket.on("connect",()=>useRealtimeStore.getState().setConnected(true));
    socket.on("disconnect",()=>useRealtimeStore.getState().setConnected(false));
    socket.onAny((event:string,payload:{workspaceId?:string;output?:SessionOutput})=>{
      useRealtimeStore.getState().setLastEvent(event);
      if(event==="session.output"&&payload?.output){
        useSessionOutputStore.getState().append(payload.output);
        return;
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
  return null;
}
