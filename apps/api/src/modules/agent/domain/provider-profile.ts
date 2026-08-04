import { SandboxModel } from "@repo/db";

import { Entity } from "../../../kernel/domain/entity";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { EmptyProviderNameError } from "./provider-profile.errors";

export interface ProviderProfileProps {
  provider: string;
  capabilities: string[];
  promptFormat: Record<string, unknown>;
  approvalRules: Record<string, unknown>;
  hookSupport: string[];
  sandboxModel: SandboxModel;
  outputSchema: Record<string, unknown>;
  available: boolean;
  quotaUnavailableUntil: Date | null;
  quotaReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProviderProfileProps {
  provider: string;
  capabilities?: string[];
  promptFormat?: Record<string, unknown>;
  approvalRules?: Record<string, unknown>;
  hookSupport?: string[];
  sandboxModel?: SandboxModel;
  outputSchema?: Record<string, unknown>;
  available?: boolean;
  quotaUnavailableUntil?: Date | null;
  quotaReason?: string | null;
}

export interface UpdateProviderProfileProps {
  capabilities?: string[];
  promptFormat?: Record<string, unknown>;
  approvalRules?: Record<string, unknown>;
  hookSupport?: string[];
  sandboxModel?: SandboxModel;
  outputSchema?: Record<string, unknown>;
  available?: boolean;
  quotaUnavailableUntil?: Date | null;
  quotaReason?: string | null;
}

function normalizeProvider(provider: string): string {
  const trimmed = provider.trim();
  if (!trimmed) {
    throw new EmptyProviderNameError();
  }
  return trimmed;
}

/**
 * Global, unscoped catalog entry describing what a provider CLI (claude,
 * codex) generically supports — not a per-workspace configuration. See the
 * "ProviderProfile est un catalogue global" decision in the implementation
 * plan: no workspaceId, seeded once, mutated rarely.
 */
export class ProviderProfile extends Entity<ProviderProfileProps> {
  static create(props: CreateProviderProfileProps, id?: UniqueEntityId): ProviderProfile {
    const now = new Date();
    return new ProviderProfile(
      {
        provider: normalizeProvider(props.provider),
        capabilities: props.capabilities ?? [],
        promptFormat: props.promptFormat ?? {},
        approvalRules: props.approvalRules ?? {},
        hookSupport: props.hookSupport ?? [],
        sandboxModel: props.sandboxModel ?? SandboxModel.WORKSPACE_WRITE,
        outputSchema: props.outputSchema ?? {},
        available: props.available ?? true,
        quotaUnavailableUntil: props.quotaUnavailableUntil ?? null,
        quotaReason: props.quotaReason ?? null,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
  }

  static reconstitute(props: ProviderProfileProps, id: UniqueEntityId): ProviderProfile {
    return new ProviderProfile(props, id);
  }

  get provider(): string {
    return this.props.provider;
  }

  get capabilities(): readonly string[] {
    return this.props.capabilities;
  }

  get promptFormat(): Record<string, unknown> {
    return this.props.promptFormat;
  }

  get approvalRules(): Record<string, unknown> {
    return this.props.approvalRules;
  }

  get hookSupport(): readonly string[] {
    return this.props.hookSupport;
  }

  get sandboxModel(): SandboxModel {
    return this.props.sandboxModel;
  }

  get outputSchema(): Record<string, unknown> {
    return this.props.outputSchema;
  }

  get available(): boolean {
    return (
      this.props.available &&
      (!this.props.quotaUnavailableUntil ||
        this.props.quotaUnavailableUntil.getTime() <= Date.now())
    );
  }

  get manuallyAvailable(): boolean {
    return this.props.available;
  }

  get quotaUnavailableUntil(): Date | null {
    return this.props.quotaUnavailableUntil;
  }

  get quotaReason(): string | null {
    return this.props.quotaReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateConfig(props: UpdateProviderProfileProps): void {
    if (props.capabilities !== undefined) {
      this.props.capabilities = props.capabilities;
    }
    if (props.promptFormat !== undefined) {
      this.props.promptFormat = props.promptFormat;
    }
    if (props.approvalRules !== undefined) {
      this.props.approvalRules = props.approvalRules;
    }
    if (props.hookSupport !== undefined) {
      this.props.hookSupport = props.hookSupport;
    }
    if (props.sandboxModel !== undefined) {
      this.props.sandboxModel = props.sandboxModel;
    }
    if (props.outputSchema !== undefined) {
      this.props.outputSchema = props.outputSchema;
    }
    if (props.available !== undefined) {
      this.props.available = props.available;
    }
    if (props.quotaUnavailableUntil !== undefined) {
      this.props.quotaUnavailableUntil = props.quotaUnavailableUntil;
    }
    if (props.quotaReason !== undefined) {
      this.props.quotaReason = props.quotaReason;
    }
    this.props.updatedAt = new Date();
  }
}
