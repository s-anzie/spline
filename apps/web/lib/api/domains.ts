import { apiRequest } from "./client";
import type {
  Agent,
  AgentSession,
  AgentQuestion,
  CollaborationSnapshot,
  Artifact,
  Decision,
  EventReceipt,
  Machine,
  Notification,
  NotificationRecipient,
  ProviderProfile,
  ResourceLock,
  RuntimeHealth,
  RuntimeProcess,
  SessionOutput,
  WorkspaceEvent,
} from "./types";

const ws = (workspaceId: string, path: string) =>
  `/workspaces/${workspaceId}${path}`;
const post = <T>(path: string, token: string, body?: unknown) =>
  apiRequest<T>(path, {
    method: "POST",
    token,
    ...(body === undefined ? {} : { body }),
  });
const patch = <T>(path: string, token: string, body: unknown) =>
  apiRequest<T>(path, { method: "PATCH", token, body });

export const domainApi = {
  providers: (token: string) =>
    apiRequest<ProviderProfile[]>("/provider-profiles", { token }),
  agents: (id: string, token: string) =>
    apiRequest<Agent[]>(ws(id, "/agents"), { token }),
  agent: (id: string, agentId: string, token: string) =>
    apiRequest<Agent>(ws(id, `/agents/${agentId}`), { token }),
  registerAgent: (id: string, input: unknown, token: string) =>
    post<Agent & { token: string }>(ws(id, "/agents"), token, input),
  backfillAgentPromptProfiles: (id: string, token: string) =>
    post<{ updated: Agent[]; count: number }>(
      ws(id, "/agents/prompt-profiles/backfill"),
      token,
    ),
  updateAgent: (id: string, agentId: string, input: unknown, token: string) =>
    patch<Agent>(ws(id, `/agents/${agentId}`), token, input),
  forceAgentOffline: (id: string, agentId: string, token: string) =>
    post<Agent>(ws(id, `/agents/${agentId}/offline`), token),
  rotateAgentToken: (id: string, agentId: string, token: string) =>
    post<{ token: string }>(
      ws(id, `/agents/${agentId}/token/rotate`),
      token,
    ),
  revokeAgentToken: (id: string, agentId: string, token: string) =>
    post<void>(ws(id, `/agents/${agentId}/token/revoke`), token),
  updateAgentHealth: (
    id: string,
    agentId: string,
    healthState: string,
    token: string,
  ) => post<Agent>(ws(id, `/agents/${agentId}/health`), token, { healthState }),
  machines: (id: string, token: string) =>
    apiRequest<Machine[]>(ws(id, "/machines"), { token }),
  registerMachine: (input: unknown, token: string) =>
    post<Machine & { token: string }>("/machines", token, input),
  linkMachine: (id: string, machineId: string, token: string) =>
    post<Machine>(ws(id, `/machines/${machineId}/link`), token),
  rotateMachineToken: (id: string, machineId: string, token: string) =>
    post<{ token: string }>(
      ws(id, `/machines/${machineId}/token/rotate`),
      token,
    ),
  revokeMachineToken: (id: string, machineId: string, token: string) =>
    post<void>(ws(id, `/machines/${machineId}/token/revoke`), token),
  processes: (id: string, token: string) =>
    apiRequest<RuntimeProcess[]>(ws(id, "/processes"), { token }),
  process: (id: string, processId: string, token: string) =>
    apiRequest<RuntimeProcess>(ws(id, `/processes/${processId}`), { token }),
  registerProcess: (id: string, input: unknown, token: string) =>
    post<RuntimeProcess>(ws(id, "/processes"), token, input),
  processAction: (
    id: string,
    processId: string,
    action: "start" | "stop" | "restart",
    token: string,
    body?: unknown,
  ) =>
    post<RuntimeProcess>(
      ws(id, `/processes/${processId}/${action}`),
      token,
      body,
    ),
  sessions: (id: string, token: string) =>
    apiRequest<AgentSession[]>(ws(id, "/agent-sessions"), { token }),
  runtimeHealth: (id: string, token: string) =>
    apiRequest<RuntimeHealth>(ws(id, "/runtime/health"), { token }),
  cancelRuntimeCommand: (id: string, commandId: string, token: string) =>
    post<{ id: string; status: string }>(
      ws(id, `/runtime/commands/${commandId}/cancel`),
      token,
    ),
  session: (id: string, sessionId: string, token: string) =>
    apiRequest<AgentSession>(ws(id, `/agent-sessions/${sessionId}`), { token }),
  sessionOutputs: (id: string, sessionId: string, token: string) =>
    apiRequest<SessionOutput[]>(
      ws(id, `/agent-sessions/${sessionId}/outputs`),
      { token },
    ),
  startSession: (id: string, input: unknown, token: string) =>
    post<AgentSession>(ws(id, "/agent-sessions"), token, input),
  agentQuestions: (id: string, token: string) =>
    apiRequest<AgentQuestion[]>(ws(id, "/agent-questions"), { token }),
  collaborationSync: (id: string, token: string) =>
    apiRequest<CollaborationSnapshot>(ws(id, "/collaboration/sync"), { token }),
  answerHumanQuestion: (
    id: string,
    notificationId: string,
    answer: string,
    token: string,
  ) =>
    post<{
      sessionId: string | null;
      answeredAt: string;
      deliveryStatus: "DELIVERED" | "PENDING_WAKE";
      warning?: string;
    }>(
      ws(id, `/collaboration/human-questions/${notificationId}/answer`),
      token,
      { answer },
    ),
  sessionAction: (
    id: string,
    sessionId: string,
    action: "stop" | "approve" | "deny" | "heartbeat" | "report",
    token: string,
    body?: unknown,
  ) =>
    post<AgentSession>(
      ws(id, `/agent-sessions/${sessionId}/${action}`),
      token,
      body,
    ),
  locks: (id: string, token: string) =>
    apiRequest<ResourceLock[]>(ws(id, "/locks"), { token }),
  acquireLock: (id: string, input: unknown, token: string) =>
    post<ResourceLock>(ws(id, "/locks"), token, input),
  releaseLock: (id: string, lockId: string, token: string) =>
    post<ResourceLock>(ws(id, `/locks/${lockId}/release`), token),
  artifacts: (id: string, token: string) =>
    apiRequest<Artifact[]>(ws(id, "/artifacts"), { token }),
  artifact: (id: string, artifactId: string, token: string) =>
    apiRequest<Artifact>(ws(id, `/artifacts/${artifactId}`), { token }),
  createArtifact: (id: string, input: unknown, token: string) =>
    post<Artifact>(ws(id, "/artifacts"), token, input),
  updateArtifact: (
    id: string,
    artifactId: string,
    input: unknown,
    token: string,
  ) => patch<Artifact>(ws(id, `/artifacts/${artifactId}`), token, input),
  artifactAction: (
    id: string,
    artifactId: string,
    action: "versions" | "link" | "unlink" | "archive",
    token: string,
    body?: unknown,
  ) =>
    post<Artifact>(ws(id, `/artifacts/${artifactId}/${action}`), token, body),
  deleteArtifact: (id: string, artifactId: string, token: string) =>
    apiRequest<void>(ws(id, `/artifacts/${artifactId}`), {
      method: "DELETE",
      token,
    }),
  decisions: (id: string, token: string) =>
    apiRequest<Decision[]>(ws(id, "/decisions"), { token }),
  decision: (id: string, decisionId: string, token: string) =>
    apiRequest<Decision>(ws(id, `/decisions/${decisionId}`), { token }),
  createDecision: (id: string, input: unknown, token: string) =>
    post<Decision>(ws(id, "/decisions"), token, input),
  events: (id: string, token: string) =>
    apiRequest<WorkspaceEvent[]>(ws(id, "/events"), { token }),
  event: (id: string, eventId: string, token: string) =>
    apiRequest<WorkspaceEvent>(ws(id, `/events/${eventId}`), { token }),
  createEvent: (id: string, input: unknown, token: string) =>
    post<WorkspaceEvent>(ws(id, "/events"), token, input),
  eventReceipts: (id: string, eventId: string, token: string) =>
    apiRequest<EventReceipt[]>(ws(id, `/events/${eventId}/receipts`), {
      token,
    }),
  recordEventReceipt: (
    id: string,
    eventId: string,
    status: string,
    token: string,
  ) =>
    post<EventReceipt>(ws(id, `/events/${eventId}/receipts`), token, {
      status,
    }),
  notifications: (id: string, token: string) =>
    apiRequest<Notification[]>(ws(id, "/notifications"), { token }),
  notification: (id: string, notificationId: string, token: string) =>
    apiRequest<Notification>(ws(id, `/notifications/${notificationId}`), {
      token,
    }),
  sendNotification: (id: string, input: unknown, token: string) =>
    post<{ notification: Notification; recipients: NotificationRecipient[] }>(
      ws(id, "/notifications"),
      token,
      input,
    ),
  advanceNotification: (
    id: string,
    notificationId: string,
    status: string,
    token: string,
  ) =>
    post<NotificationRecipient>(
      ws(id, `/notifications/${notificationId}/advance`),
      token,
      { status },
    ),
  unreadNotifications: (recipientId: string, token: string) =>
    apiRequest<
      Array<{ notification: Notification; recipient: NotificationRecipient }>
    >(
      `/notifications/unread?recipientType=HUMAN&recipientId=${encodeURIComponent(recipientId)}`,
      { token },
    ),
};
