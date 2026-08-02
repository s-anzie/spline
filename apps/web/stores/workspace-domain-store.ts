"use client";

import { create } from "zustand";
import { domainApi } from "@/lib/api/domains";
import type {
  Agent,
  AgentSession,
  AgentQuestion,
  AgentWakeStatus,
  Artifact,
  Decision,
  Machine,
  Notification,
  ProviderProfile,
  ResourceLock,
  RuntimeHealth,
  RuntimeProcess,
  WorkspaceEvent,
} from "@/lib/api/types";
import { useAuthStore } from "./auth-store";

type DomainState = {
  workspaceId: string | null;
  agents: Agent[];
  providers: ProviderProfile[];
  machines: Machine[];
  processes: RuntimeProcess[];
  sessions: AgentSession[];
  questions: AgentQuestion[];
  wakeStatus: AgentWakeStatus[];
  locks: ResourceLock[];
  artifacts: Artifact[];
  decisions: Decision[];
  events: WorkspaceEvent[];
  notifications: Notification[];
  runtimeHealth: RuntimeHealth | null;
  loading: boolean;
  pendingAction: string | null;
  error: string | null;
  load: (workspaceId: string, force?: boolean) => Promise<void>;
  registerAgent: (input: unknown) => Promise<Agent & { token: string }>;
  backfillAgentPromptProfiles: () => Promise<number>;
  registerMachine: (input: unknown) => Promise<Machine & { token: string }>;
  linkMachine: (machineId: string) => Promise<void>;
  registerProcess: (input: unknown) => Promise<void>;
  startSession: (input: unknown) => Promise<AgentSession>;
  acquireLock: (input: unknown) => Promise<void>;
  createArtifact: (input: unknown) => Promise<Artifact>;
  artifactAction: (
    artifactId: string,
    action: "versions" | "link" | "unlink" | "archive",
    body?: unknown,
  ) => Promise<void>;
  updateArtifact: (artifactId: string, input: unknown) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  updateAgent: (agentId: string, input: unknown) => Promise<void>;
  updateAgentHealth: (agentId: string, healthState: string) => Promise<void>;
  createDecision: (input: unknown) => Promise<void>;
  createEvent: (input: unknown) => Promise<void>;
  recordEventReceipt: (eventId: string, status: string) => Promise<void>;
  sendNotification: (input: unknown) => Promise<void>;
  advanceNotification: (
    notificationId: string,
    status: string,
  ) => Promise<void>;
  processAction: (
    processId: string,
    action: "start" | "stop" | "restart",
    machineId?: string,
  ) => Promise<void>;
  sessionAction: (
    sessionId: string,
    action: "stop" | "approve" | "deny" | "heartbeat" | "report",
    value?: string,
  ) => Promise<void>;
  releaseLock: (lockId: string) => Promise<void>;
  reset: () => void;
};

function authToken() {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error("Session requise");
  return token;
}
const empty = {
  workspaceId: null,
  agents: [],
  providers: [],
  machines: [],
  processes: [],
  sessions: [],
  questions: [],
  wakeStatus: [],
  locks: [],
  artifacts: [],
  decisions: [],
  events: [],
  notifications: [],
  runtimeHealth: null,
  loading: false,
  pendingAction: null,
  error: null,
};

export const useWorkspaceDomainStore = create<DomainState>((set, get) => ({
  ...empty,
  load: async (workspaceId, force = false) => {
    if (get().workspaceId === workspaceId && !force) return;
    const changingWorkspace = get().workspaceId !== workspaceId;
    if (changingWorkspace) set({ ...empty, workspaceId, loading: true });
    else set({ error: null, loading: false });
    try {
      const token = authToken();
      const [
        agents,
        providers,
        machines,
        processes,
        sessions,
        collaboration,
        locks,
        artifacts,
        decisions,
        events,
        notifications,
        runtimeHealth,
      ] = await Promise.all([
        domainApi.agents(workspaceId, token),
        domainApi.providers(token),
        domainApi.machines(workspaceId, token),
        domainApi.processes(workspaceId, token),
        domainApi.sessions(workspaceId, token),
        domainApi.collaborationSync(workspaceId, token),
        domainApi.locks(workspaceId, token),
        domainApi.artifacts(workspaceId, token),
        domainApi.decisions(workspaceId, token),
        domainApi.events(workspaceId, token),
        domainApi.notifications(workspaceId, token),
        // Health is diagnostic, not core domain data — never let it fail the
        // whole workspace load.
        domainApi.runtimeHealth(workspaceId, token).catch(() => null),
      ]);
      if (get().workspaceId === workspaceId)
        set({
          agents,
          providers,
          machines,
          processes,
          sessions,
          questions: collaboration.questions,
          wakeStatus: collaboration.wakeStatus,
          locks,
          artifacts,
          decisions,
          events,
          notifications,
          runtimeHealth,
          loading: false,
        });
    } catch (error) {
      if (get().workspaceId === workspaceId)
        set({
          loading: false,
          error:
            error instanceof Error ? error.message : "Données indisponibles",
        });
    }
  },
  registerAgent: async (input) => {
    const id = get().workspaceId;
    if (!id) throw new Error("Workspace requis");
    set({ pendingAction: "agent:register", error: null });
    try {
      const agent = await domainApi.registerAgent(id, input, authToken());
      set((state) => ({
        agents: [agent, ...state.agents],
        pendingAction: null,
      }));
      return agent;
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Enregistrement impossible",
      });
      throw error;
    }
  },
  backfillAgentPromptProfiles: async () => {
    const id = get().workspaceId;
    if (!id) return 0;
    set({ pendingAction: "agent:profiles:backfill", error: null });
    try {
      const result = await domainApi.backfillAgentPromptProfiles(
        id,
        authToken(),
      );
      set((state) => ({
        agents: state.agents.map(
          (agent) =>
            result.updated.find((item) => item.id === agent.id) ?? agent,
        ),
        pendingAction: null,
      }));
      return result.count;
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Initialisation impossible",
      });
      throw error;
    }
  },
  registerMachine: async (input) => {
    set({ pendingAction: "machine:register", error: null });
    try {
      const machine = await domainApi.registerMachine(input, authToken());
      set((state) => ({
        machines: [machine, ...state.machines],
        pendingAction: null,
      }));
      return machine;
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Enregistrement impossible",
      });
      throw error;
    }
  },
  linkMachine: async (machineId) => {
    const id = get().workspaceId;
    if (!id) throw new Error("Workspace requis");
    set({ pendingAction: `machine:${machineId}:link`, error: null });
    try {
      const machine = await domainApi.linkMachine(id, machineId, authToken());
      set((state) => ({
        machines: state.machines.some((item) => item.id === machine.id)
          ? state.machines.map((item) =>
              item.id === machine.id ? machine : item,
            )
          : [machine, ...state.machines],
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Liaison impossible",
      });
      throw error;
    }
  },
  registerProcess: async (input) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: "process:register", error: null });
    try {
      const process = await domainApi.registerProcess(id, input, authToken());
      set((state) => ({
        processes: [process, ...state.processes],
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Enregistrement impossible",
      });
      throw error;
    }
  },
  startSession: async (input) => {
    const id = get().workspaceId;
    if (!id) throw new Error("Workspace requis");
    set({ pendingAction: "session:start", error: null });
    try {
      const session = await domainApi.startSession(id, input, authToken());
      set((state) => ({
        sessions: [session, ...state.sessions],
        pendingAction: null,
      }));
      return session;
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Démarrage impossible",
      });
      throw error;
    }
  },
  acquireLock: async (input) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: "lock:acquire", error: null });
    try {
      const lock = await domainApi.acquireLock(id, input, authToken());
      set((state) => ({ locks: [lock, ...state.locks], pendingAction: null }));
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Acquisition impossible",
      });
      throw error;
    }
  },
  createArtifact: async (input) => {
    const id = get().workspaceId;
    if (!id) throw new Error("Workspace requis");
    set({ pendingAction: "artifact:create", error: null });
    try {
      const artifact = await domainApi.createArtifact(id, input, authToken());
      set((state) => ({
        artifacts: [artifact, ...state.artifacts],
        pendingAction: null,
      }));
      return artifact;
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Création impossible",
      });
      throw error;
    }
  },
  artifactAction: async (artifactId, action, body) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: `artifact:${artifactId}:${action}`, error: null });
    try {
      const artifact = await domainApi.artifactAction(
        id,
        artifactId,
        action,
        authToken(),
        body,
      );
      set((state) => ({
        artifacts: state.artifacts.map((item) =>
          item.id === artifact.id ? artifact : item,
        ),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Action impossible",
      });
      throw error;
    }
  },
  updateArtifact: async (artifactId, input) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: `artifact:${artifactId}:update`, error: null });
    try {
      const artifact = await domainApi.updateArtifact(
        id,
        artifactId,
        input,
        authToken(),
      );
      set((state) => ({
        artifacts: state.artifacts.map((item) =>
          item.id === artifact.id ? artifact : item,
        ),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Mise à jour impossible",
      });
      throw error;
    }
  },
  deleteArtifact: async (artifactId) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: `artifact:${artifactId}:delete`, error: null });
    try {
      await domainApi.deleteArtifact(id, artifactId, authToken());
      set((state) => ({
        artifacts: state.artifacts.filter((item) => item.id !== artifactId),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Suppression impossible",
      });
      throw error;
    }
  },
  updateAgent: async (agentId, input) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: `agent:${agentId}:update`, error: null });
    try {
      const agent = await domainApi.updateAgent(
        id,
        agentId,
        input,
        authToken(),
      );
      set((state) => ({
        agents: state.agents.map((item) =>
          item.id === agent.id ? agent : item,
        ),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Mise à jour impossible",
      });
      throw error;
    }
  },
  updateAgentHealth: async (agentId, healthState) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: `agent:${agentId}:health`, error: null });
    try {
      const agent = await domainApi.updateAgentHealth(
        id,
        agentId,
        healthState,
        authToken(),
      );
      set((state) => ({
        agents: state.agents.map((item) =>
          item.id === agent.id ? agent : item,
        ),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : "Mise à jour impossible",
      });
      throw error;
    }
  },
  createDecision: async (input) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: "decision:create", error: null });
    try {
      const decision = await domainApi.createDecision(id, input, authToken());
      set((state) => ({
        decisions: [decision, ...state.decisions],
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Création impossible",
      });
      throw error;
    }
  },
  createEvent: async (input) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: "event:create", error: null });
    try {
      const event = await domainApi.createEvent(id, input, authToken());
      set((state) => ({
        events: [event, ...state.events],
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Création impossible",
      });
      throw error;
    }
  },
  recordEventReceipt: async (eventId, status) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: `event:${eventId}:receipt`, error: null });
    try {
      await domainApi.recordEventReceipt(id, eventId, status, authToken());
      set({ pendingAction: null });
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Action impossible",
      });
      throw error;
    }
  },
  sendNotification: async (input) => {
    const id = get().workspaceId;
    if (!id) return;
    set({ pendingAction: "notification:send", error: null });
    try {
      const result = await domainApi.sendNotification(id, input, authToken());
      set((state) => ({
        notifications: [result.notification, ...state.notifications],
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Envoi impossible",
      });
      throw error;
    }
  },
  advanceNotification: async (notificationId, status) => {
    const id = get().workspaceId;
    if (!id) return;
    set({
      pendingAction: `notification:${notificationId}:advance`,
      error: null,
    });
    try {
      await domainApi.advanceNotification(
        id,
        notificationId,
        status,
        authToken(),
      );
      set({ pendingAction: null });
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Action impossible",
      });
      throw error;
    }
  },
  processAction: async (processId, action, machineId) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;
    set({ pendingAction: `process:${processId}:${action}`, error: null });
    try {
      const process = await domainApi.processAction(
        workspaceId,
        processId,
        action,
        authToken(),
        action === "start" ? { machineId } : undefined,
      );
      set((state) => ({
        processes: state.processes.map((item) =>
          item.id === process.id ? process : item,
        ),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Action impossible",
      });
    }
  },
  sessionAction: async (sessionId, action, value) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;
    set({ pendingAction: `session:${sessionId}:${action}`, error: null });
    try {
      const session = await domainApi.sessionAction(
        workspaceId,
        sessionId,
        action,
        authToken(),
        action === "report" ? { status: value } : undefined,
      );
      set((state) => ({
        sessions: state.sessions.map((item) =>
          item.id === session.id ? session : item,
        ),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Action impossible",
      });
    }
  },
  releaseLock: async (lockId) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;
    set({ pendingAction: `lock:${lockId}`, error: null });
    try {
      const lock = await domainApi.releaseLock(
        workspaceId,
        lockId,
        authToken(),
      );
      set((state) => ({
        locks: state.locks.map((item) => (item.id === lock.id ? lock : item)),
        pendingAction: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : "Libération impossible",
      });
    }
  },
  reset: () => set(empty),
}));
