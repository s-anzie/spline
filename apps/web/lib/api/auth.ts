import { apiRequest } from "./client";
import type { AuthSession, User } from "./types";

export const authApi = {
  login: (email: string, password: string) => apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: { email, password },
  }),
  register: (displayName: string, email: string, password: string) => apiRequest<User>("/auth/register", {
    method: "POST",
    body: { displayName, email, password },
  }),
};
