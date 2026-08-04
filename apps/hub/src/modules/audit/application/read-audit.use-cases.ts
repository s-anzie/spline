import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { AuditEntry } from "../domain/audit-entry";
import { AuditEntryNotFoundError } from "../domain/audit.errors";
import { ChainVerification, verifyChain } from "../domain/audit-signature";
import {
  AUDIT_REPOSITORY,
  AuditRepository,
  ListAuditFilter,
} from "../domain/ports/audit.repository.port";

export interface ListAuditInput extends Omit<ListAuditFilter, "actor"> {
  actorType?: ActorType;
  actorId?: string;
}

@Injectable()
export class ListAuditEntriesUseCase
  implements UseCase<ListAuditInput, Result<AuditEntry[], GuardViolation>>
{
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly entries: AuditRepository,
  ) {}

  async execute(input: ListAuditInput): Promise<Result<AuditEntry[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    let actor: ActorRef | undefined;
    if (input.actorType !== undefined && input.actorId !== undefined) {
      const parsed = ActorRef.create(input.actorType, input.actorId);
      if (parsed.isFailure) {
        return Result.fail(parsed.error);
      }
      actor = parsed.value;
    }
    return Result.ok(
      await this.entries.list({ ...input, workspaceId: workspaceId.value, actor }),
    );
  }
}

/**
 * The operational meaning of "l'audit est immuable" (§4.23): tampering is
 * detectable, and the answer says WHERE it breaks rather than only that it
 * does (§17.8).
 */
@Injectable()
export class VerifyAuditChainUseCase
  implements UseCase<{ workspaceId: string }, Result<ChainVerification, GuardViolation>>
{
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly entries: AuditRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(input: {
    workspaceId: string;
  }): Promise<Result<ChainVerification, GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const chain = await this.entries.listChain(workspaceId.value);
    return Result.ok(
      verifyChain(chain, this.config.getOrThrow<string>("AUDIT_SIGNING_KEY")),
    );
  }
}

/**
 * Verification reports `brokenAt.id` — the entry where the chain fails. An
 * investigator told which entry broke it must be able to read that entry;
 * otherwise the detection stops one step short of being usable (§17.8).
 */
@Injectable()
export class GetAuditEntryUseCase
  implements
    UseCase<
      { workspaceId: string; entryId: string },
      Result<AuditEntry, AuditEntryNotFoundError>
    >
{
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly entries: AuditRepository,
  ) {}

  async execute(input: {
    workspaceId: string;
    entryId: string;
  }): Promise<Result<AuditEntry, AuditEntryNotFoundError>> {
    const entry = await this.entries.findById(input.entryId);
    if (!entry || entry.workspaceId !== input.workspaceId) {
      return Result.fail(new AuditEntryNotFoundError(input.entryId));
    }
    return Result.ok(entry);
  }
}
