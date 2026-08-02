import { apiRequest } from "./client";
import type { Goal, GoalStatus, Priority, Task, TaskStatus } from "./types";

export const planningApi = {
  goals: (workspaceId: string, token: string) =>
    apiRequest<Goal[]>(`/workspaces/${workspaceId}/goals`, { token }),
  goal: (workspaceId: string, goalId: string, token: string) =>
    apiRequest<Goal>(`/workspaces/${workspaceId}/goals/${goalId}`, { token }),
  tasks: (workspaceId: string, token: string, goalId?: string) =>
    apiRequest<Task[]>(
      `/workspaces/${workspaceId}/tasks${goalId ? `?goalId=${encodeURIComponent(goalId)}` : ""}`,
      { token },
    ),
  task: (workspaceId: string, taskId: string, token: string) =>
    apiRequest<Task>(`/workspaces/${workspaceId}/tasks/${taskId}`, { token }),
  createGoal: (
    workspaceId: string,
    input: { title: string; description?: string; priority?: Priority },
    token: string,
  ) =>
    apiRequest<Goal>(`/workspaces/${workspaceId}/goals`, {
      method: "POST",
      body: input,
      token,
    }),
  createTask: (
    workspaceId: string,
    input: {
      title: string;
      description?: string;
      goalId?: string;
      priority?: Priority;
    },
    token: string,
  ) =>
    apiRequest<Task>(`/workspaces/${workspaceId}/tasks`, {
      method: "POST",
      body: input,
      token,
    }),
  updateGoal: (
    workspaceId: string,
    goalId: string,
    input: unknown,
    token: string,
  ) =>
    apiRequest<Goal>(`/workspaces/${workspaceId}/goals/${goalId}`, {
      method: "PATCH",
      body: input,
      token,
    }),
  goalStatus: (
    workspaceId: string,
    goalId: string,
    status: GoalStatus,
    token: string,
  ) =>
    apiRequest<Goal>(`/workspaces/${workspaceId}/goals/${goalId}/status`, {
      method: "POST",
      body: { status },
      token,
    }),
  goalBlocker: (
    workspaceId: string,
    goalId: string,
    reason: string,
    token: string,
  ) =>
    apiRequest<Goal>(`/workspaces/${workspaceId}/goals/${goalId}/blockers`, {
      method: "POST",
      body: { reason },
      token,
    }),
  goalReview: (
    workspaceId: string,
    goalId: string,
    action: "validate" | "reject",
    token: string,
  ) =>
    apiRequest<Goal>(`/workspaces/${workspaceId}/goals/${goalId}/${action}`, {
      method: "POST",
      token,
    }),
  updateTask: (
    workspaceId: string,
    taskId: string,
    input: unknown,
    token: string,
  ) =>
    apiRequest<Task>(`/workspaces/${workspaceId}/tasks/${taskId}`, {
      method: "PATCH",
      body: input,
      token,
    }),
  taskStatus: (
    workspaceId: string,
    taskId: string,
    status: TaskStatus,
    token: string,
  ) =>
    apiRequest<Task>(`/workspaces/${workspaceId}/tasks/${taskId}/status`, {
      method: "POST",
      body: { status },
      token,
    }),
  assignTask: (
    workspaceId: string,
    taskId: string,
    assigneeType: string,
    assigneeId: string,
    token: string,
  ) =>
    apiRequest<Task>(`/workspaces/${workspaceId}/tasks/${taskId}/assign`, {
      method: "POST",
      body: { assigneeType, assigneeId },
      token,
    }),
  taskBlocker: (
    workspaceId: string,
    taskId: string,
    reason: string,
    token: string,
  ) =>
    apiRequest<Task>(`/workspaces/${workspaceId}/tasks/${taskId}/blockers`, {
      method: "POST",
      body: { reason },
      token,
    }),
  taskReview: (
    workspaceId: string,
    taskId: string,
    action: "validate" | "reject",
    token: string,
  ) =>
    apiRequest<Task>(`/workspaces/${workspaceId}/tasks/${taskId}/${action}`, {
      method: "POST",
      token,
    }),
};
