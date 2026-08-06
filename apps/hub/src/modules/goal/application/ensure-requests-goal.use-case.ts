import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef } from "../../identity/domain/actor";
import { Goal } from "../domain/goal";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

/**
 * The title is the identity. A slug column would be a second way to say the
 * same thing, and the two would drift the first time somebody renamed it.
 */
export const REQUESTS_GOAL_TITLE = "Requests from people";

/**
 * §4.5 — where a need lands before anybody has worked out what it means.
 *
 * A task must serve a goal, and a goal must say what would prove it reached
 * (§4.5). Those two rules together are what stops the hub from turning "improve
 * the document creation flow" into a goal by itself: the person did not say
 * when it is done, and inventing criteria on their behalf would put words in
 * their mouth that the whole system then treats as theirs.
 *
 * So a request is a TASK, under a standing goal whose criterion is true of
 * every request without being about any of them. Working out the real goal —
 * with real criteria — is the manager's first job, and it stays visibly
 * separate from what was asked for.
 *
 * Idempotent by title: opened the first time somebody hands a need over, and
 * never again.
 */
@Injectable()
export class EnsureRequestsGoalUseCase
  implements UseCase<{ workspaceId: string; owner: ActorRef }, Result<{ goalId: string }, never>>
{
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: {
    workspaceId: string;
    owner: ActorRef;
  }): Promise<Result<{ goalId: string }, never>> {
    const existing = await this.goals.findByTitle(input.workspaceId, REQUESTS_GOAL_TITLE);
    if (existing) {
      return Result.ok({ goalId: existing.id.value });
    }

    const goal = Goal.create({
      workspaceId: input.workspaceId,
      title: REQUESTS_GOAL_TITLE,
      description:
        "Needs stated by people, before anybody has worked out what they mean. " +
        "Each one is a task here until a manager turns it into a goal of its own.",
      successCriteria: [
        "every need stated here has been turned into work, or answered with why it cannot be",
      ],
      owner: input.owner,
      now: this.clock.now(),
    });
    if (goal.isFailure) {
      // Its inputs are this class's own constants; a failure would be a bug
      // here rather than something a caller can act on.
      throw new Error(`could not open the requests goal: ${goal.error.message}`);
    }

    await this.goals.save(goal.value);
    await flushDomainEvents(goal.value, this.publisher);
    return Result.ok({ goalId: goal.value.id.value });
  }
}
