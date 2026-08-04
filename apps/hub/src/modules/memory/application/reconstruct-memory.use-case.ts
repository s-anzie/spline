import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../../artifact/domain/ports/artifact.repository.port";
import {
  DECISION_REPOSITORY,
  DecisionRepository,
} from "../../decision/domain/ports/decision.repository.port";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { MemoryEntry } from "../domain/memory-entry";
import {
  MEMORY_REPOSITORY,
  MemoryRepository,
} from "../domain/ports/memory.repository.port";

export interface ReconstructMemoryInput {
  workspaceId: string;
  actorType: ActorType;
  actorId: string;
}

export interface ReconstructionReport {
  posed: number;
  alreadyPresent: number;
  /** §17.8 — what was rebuilt, and what could not be, named. */
  sources: { sourceType: string; count: number }[];
  notReconstructed: string[];
}

/**
 * §16.10 — "toute mémoire peut être reconstruite à partir des Artifacts, des
 * Events, des Decisions, des Repositories".
 *
 * This is the operation that PROVES the module's central claim: memory is
 * never the source of truth (§16 opening). If dropping the table were lossy,
 * this would be impossible to write. It poses references, never copies — the
 * decision's rationale stays in the decision.
 *
 * Idempotent: a reference exists once per source, enforced by a unique index,
 * so running it twice does not pile up duplicates.
 */
@Injectable()
export class ReconstructMemoryUseCase
  implements
    UseCase<ReconstructMemoryInput, Result<ReconstructionReport, GuardViolation>>
{
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ReconstructMemoryInput,
  ): Promise<Result<ReconstructionReport, GuardViolation>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const now = this.clock.now();
    let posed = 0;
    let alreadyPresent = 0;
    const sources: { sourceType: string; count: number }[] = [];

    for (const source of await this.gather(input.workspaceId)) {
      sources.push({ sourceType: source.sourceType, count: source.items.length });
      for (const item of source.items) {
        const existing = await this.memory.findReference(
          input.workspaceId,
          "WORKSPACE",
          input.workspaceId,
          source.sourceType,
          item.id,
        );
        if (existing) {
          alreadyPresent++;
          continue;
        }
        const entry = MemoryEntry.remember({
          workspaceId: input.workspaceId,
          scopeType: "WORKSPACE",
          scopeId: input.workspaceId,
          type: source.sourceType,
          title: item.title,
          // A reference, never a copy: the rationale stays in the decision.
          sourceType: source.sourceType,
          sourceId: item.id,
          tags: ["reconstructed"],
          author: actor.value,
          now,
        });
        if (entry.isFailure) {
          continue;
        }
        await this.memory.save(entry.value);
        await flushDomainEvents(entry.value, this.publisher);
        posed++;
      }
    }

    return Result.ok({
      posed,
      alreadyPresent,
      sources,
      // Said rather than quietly omitted: a caller must not read a partial
      // rebuild as a complete one (§17.8).
      notReconstructed: [
        "repository — the Repository Engine (§8) does not exist",
        "event — the journal is already queryable; mirroring it as notes would duplicate a source of truth (§16 opening)",
      ],
    });
  }

  private async gather(workspaceId: string): Promise<
    { sourceType: string; items: { id: string; title: string }[] }[]
  > {
    const [decisions, artifacts] = await Promise.all([
      this.decisions.list({ workspaceId }),
      this.artifacts.list({ workspaceId }),
    ]);
    return [
      {
        sourceType: "decision",
        items: decisions.map((decision) => ({
          id: decision.id.value,
          title: decision.subject,
        })),
      },
      {
        sourceType: "artifact",
        items: artifacts.map((artifact) => ({
          id: artifact.id.value,
          title: artifact.name,
        })),
      },
    ];
  }
}
