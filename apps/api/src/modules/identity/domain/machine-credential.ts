import { Entity } from "../../../kernel/domain/entity";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";

export interface MachineCredentialProps {
  machineId: string;
  tokenHash: string;
  createdAt: Date;
  revokedAt?: Date;
}

export interface CreateMachineCredentialProps {
  machineId: string;
  tokenHash: string;
  createdAt?: Date;
  revokedAt?: Date;
}

export class MachineCredential extends Entity<MachineCredentialProps> {
  static create(props: CreateMachineCredentialProps, id?: UniqueEntityId): MachineCredential {
    return new MachineCredential(
      {
        machineId: props.machineId,
        tokenHash: props.tokenHash,
        createdAt: props.createdAt ?? new Date(),
        revokedAt: props.revokedAt,
      },
      id,
    );
  }

  get machineId(): string {
    return this.props.machineId;
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
