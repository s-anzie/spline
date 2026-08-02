import { apiRequest } from "./client";
import type { CreateWorkspaceInput, Workspace } from "./types";

export const workspaceApi = {
  list: (token: string) => apiRequest<Workspace[]>("/workspaces", { token }),
  get: (workspaceId: string, token: string) =>
    apiRequest<Workspace>(`/workspaces/${workspaceId}`, { token }),
  create: (input: CreateWorkspaceInput, token: string) =>
    apiRequest<Workspace>("/workspaces", {
      method: "POST",
      body: input,
      token,
    }),
  rename: (id: string, name: string, token: string) =>
    apiRequest<Workspace>(`/workspaces/${id}`, {
      method: "PATCH",
      body: { name },
      token,
    }),
  updateIdentity: (
    id: string,
    input: { name: string; description: string },
    token: string,
  ) =>
    apiRequest<Workspace>(`/workspaces/${id}`, {
      method: "PATCH",
      body: input,
      token,
    }),
  ruleset: (id: string, ruleset: Record<string, unknown>, token: string) =>
    apiRequest<Workspace>(`/workspaces/${id}/ruleset`, {
      method: "PATCH",
      body: { ruleset },
      token,
    }),
  rootPath: (id: string, rootPath: string, token: string) =>
    apiRequest<Workspace>(`/workspaces/${id}/root-path`, {
      method: "PATCH",
      body: { rootPath },
      token,
    }),
  archive: (id: string, token: string) =>
    apiRequest<Workspace>(`/workspaces/${id}/archive`, {
      method: "POST",
      token,
    }),
  duplicate: (id: string, name: string, token: string) =>
    apiRequest<Workspace>(`/workspaces/${id}/duplicate`, {
      method: "POST",
      body: { name },
      token,
    }),
};
