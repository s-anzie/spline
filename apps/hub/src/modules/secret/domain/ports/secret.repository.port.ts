import { Secret } from "../secret";

export interface SecretRepository {
  save(secret: Secret): Promise<void>;
  findByName(workspaceId: string, name: string): Promise<Secret | null>;
  /**
   * §18.4 — resolves several at once, because a task declares the set it
   * requires and partial delivery would leave it half-configured.
   */
  findManyByName(workspaceId: string, names: readonly string[]): Promise<Secret[]>;
  /** Names and metadata only. There is no route that returns values. */
  listNames(workspaceId: string, limit?: number): Promise<Secret[]>;
  delete(id: string): Promise<void>;
}

export const SECRET_REPOSITORY = "secret/SecretRepository";
