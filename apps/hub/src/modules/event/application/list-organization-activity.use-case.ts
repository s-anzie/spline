import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { Event } from "../domain/event";
import { EVENT_REPOSITORY, EventRepository } from "../domain/ports/event.repository.port";
import {
  ORGANIZATION_SUBJECTS,
  OrganizationSubjects,
} from "../domain/ports/organization-subjects.port";

export interface ListOrganizationActivityInput {
  organizationId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * §14, §4.2 — what the organization itself did.
 *
 * Two filters, and both are load-bearing:
 *
 * `workspaceId: null` is what makes this NOT a roll-up. A page that merged
 * the journals of the workspaces underneath would be the first read to cross
 * §4.2, and every screen after it would cite this one as the precedent.
 * Everything that happened in a workspace is read in that workspace.
 *
 * `concerning` is what makes it yours. Workspace-less facts are the pairing
 * requests, the identities, the machines — of EVERY organization on this hub.
 * Filtering only by the absent workspace would hand one operator the
 * hostnames and capabilities of every other, which is the exact leak that
 * already had to be closed once on the enrolment list.
 */
@Injectable()
export class ListOrganizationActivityUseCase
  implements UseCase<ListOrganizationActivityInput, Result<Event[], never>>
{
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(ORGANIZATION_SUBJECTS) private readonly subjects: OrganizationSubjects,
  ) {}

  async execute(
    input: ListOrganizationActivityInput,
  ): Promise<Result<Event[], never>> {
    const concerning = await this.subjects.subjectIdsOf(input.organizationId);
    if (concerning.length === 0) {
      return Result.ok([]);
    }

    const events = await this.events.list({
      workspaceId: null,
      concerning,
      // The tail, not the head: an organization that has paired machines for
      // a year should open on this week, not on its first hour.
      newestFirst: true,
      limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    });
    return Result.ok(events);
  }
}
