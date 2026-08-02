export type User = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthSession = {
  token: string;
  user: User;
};

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  ruleset: Record<string, unknown>;
  rootPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkspaceInput = {
  name: string;
  description?: string;
};

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type GoalStatus = "PLANNED" | "ACTIVE" | "BLOCKED" | "AT_RISK" | "REVIEW" | "COMPLETED" | "CANCELLED";
export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE" | "CANCELLED";

export type Goal = {
  id: string; workspaceId: string; title: string; description: string | null;
  status: GoalStatus; priority: Priority; ownerType: string; ownerId: string;
  successCriteria: unknown[]; progressPercentage: number; startDate: string | null;
  dueDate: string | null; dependencies: string[]; blockers: unknown[];
  validationState: string; createdAt: string; updatedAt: string;
};

export type Task = {
  id: string; workspaceId: string; goalId: string | null; title: string;
  description: string | null; status: TaskStatus; priority: Priority;
  assigneeType: string | null; assigneeId: string | null; dependencies: string[];
  blockers: unknown[]; validationState: string; createdByType: string;
  createdById: string; updatedByType: string | null; updatedById: string | null;
  createdAt: string; updatedAt: string;
};

export type Agent = { id:string; workspaceId:string; provider:string; displayName:string; capabilities:string[]; status:string; currentTaskId:string|null; lastSeenAt:string|null; promptProfile:Record<string,unknown>; permissions:string[]; healthState:string; createdAt:string; updatedAt:string };
export type ProviderProfile = { id:string; provider:string; capabilities:unknown; promptFormat:unknown; approvalRules:unknown; hookSupport:unknown; sandboxModel:unknown; outputSchema:unknown; createdAt:string; updatedAt:string };
export type Machine = { id:string; hostname:string; os:string; workspaceIds:string[]; runtimeStatus:string; lastSeenAt:string|null; createdAt:string; updatedAt:string };
export type RuntimeProcess = { id:string; workspaceId:string; name:string; command:string; cwd:string; env:Record<string,string>; status:string; ownerAgentId:string|null; ownerSessionId:string|null; machineId:string|null; pid:number|null; ports:number[]; logsRef:string|null; restartPolicy:string; createdAt:string; updatedAt:string };
export type AgentSession = { id:string; agentId:string; provider:string; workspaceId:string; machineId:string; status:string; startedAt:string; lastHeartbeatAt:string|null; currentProcessId:string|null; currentTaskId:string|null; approvalState:string; providerSessionId:string|null; resumedFromSessionId:string|null; instruction:string|null; endedAt:string|null; createdAt:string; updatedAt:string };
export type SessionOutput = { id:string; sessionId:string; sequence:number; stream:"STDOUT"|"STDERR"; content:string; createdAt:string };
export type AgentQuestion = { id:string; workspaceId:string; askerAgentId:string; managerAgentId:string; sessionId:string|null; question:string; context:string; options:string[]; recommendation:string|null; blocking:boolean; status:"OPEN"|"ANSWERED"|"ACKNOWLEDGED"|"CLOSED"; answer:string|null; answeredByAgentId:string|null; answeredAt:string|null; acknowledgedAt:string|null; closedAt:string|null; createdAt:string; updatedAt:string };
export type AgentWakeStatus = { agentId:string; provider:string; scheduler:{status:string;session?:{id:string;status:string;startedAt:string;endedAt:string|null}}; nativeCron:{status:string;createdAt?:string;sessionId?:string} };
export type CollaborationSnapshot = { questions:AgentQuestion[]; wakeStatus:AgentWakeStatus[] };
export type ResourceLock = { id:string; workspaceId:string; resourceType:string; resourceId:string; lockedByType:string; lockedById:string; lockedAt:string; expiresAt:string|null; reason:string|null; scope:string|null; releasedAt:string|null; isHeld:boolean };
export type Artifact = { id:string; workspaceId:string; goalId:string|null; taskId:string|null; decisionId:string|null; processId:string|null; type:string; name:string; description:string|null; status:string; version:number; versions:unknown[]; source:string|null; contentRef:string|null; checksum:string|null; createdByType:string; createdById:string; updatedByType:string|null; updatedById:string|null; createdAt:string; updatedAt:string };
export type Decision = { id:string; workspaceId:string; subject:string; context:string|null; optionsConsidered:string[]; decision:string; decidedByType:string; decidedById:string; decidedAt:string; confidence:number|null; references:string[] };
export type WorkspaceEvent = { id:string; workspaceId:string; type:string; severity:string; actor:{type:string;id:string}; target:{type:string;id:string}|null; payload:Record<string,unknown>; createdAt:string };
export type EventReceipt = { id:string; eventId:string; actorType:string; actorId:string; status:string; seenAt:string|null; acknowledgedAt:string|null; actedAt:string|null };
export type Notification = { id:string; workspaceId:string; kind:string; scope:string; taskId:string|null; title:string|null; body:string; payload:Record<string,unknown>; linkedEventId?:string|null; createdBy:{type:string;id:string}; createdAt:string };
export type NotificationRecipient = { id:string; notificationId:string; recipientType:string; recipientId:string; deliveryStatus:string; deliveredAt:string|null; readAt?:string|null; acknowledgedAt?:string|null; actionTakenAt?:string|null; lastSeenAt:string|null; failureReason?:string|null };
