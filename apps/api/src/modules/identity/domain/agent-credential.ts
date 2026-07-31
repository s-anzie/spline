import { Entity } from "../../../kernel/domain/entity";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";

export interface AgentCredentialProps {
  agentId: string;
  tokenHash: string;
  createdAt: Date;
  revokedAt?: Date;
}

export interface CreateAgentCredentialProps {
  agentId: string;
  tokenHash: string;
  createdAt?: Date;
  revokedAt?: Date;
}

export class AgentCredential extends Entity<AgentCredentialProps> {
  static create(props: CreateAgentCredentialProps, id?: UniqueEntityId): AgentCredential {
    return new AgentCredential(
      {
        agentId: props.agentId,
        tokenHash: props.tokenHash,
        createdAt: props.createdAt ?? new Date(),
        revokedAt: props.revokedAt,
      },
      id,
    );
  }

  get agentId(): string {
    return this.props.agentId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get revokedAt(): Date | undefined {
    return this.props.revokedAt;
  }

  isActive(): boolean {
    return this.props.revokedAt === undefined;
  }

  revoke(now: Date): void {
    this.props.revokedAt = now;
  }
}
