import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { TaskAssigned, TaskCreated } from "../../task/domain/task-events";
import { SendNotificationUseCase } from "./send-notification.use-case";

/**
 * §4.6 requires a task to have exactly one owner from creation; that owner
 * has to learn about it. This is the only listener wired today, and the
 * reason is the recipient: exactly one, determined by the fact itself, with
 * no policy to consult.
 *
 * §17.9 lists eight alerts, but seven of them belong to modules that do not
 * exist yet (Worker, Lease, Validation, Policy, Repository, Provider,
 * Extension) — wiring them now would mean inventing their producers. And
 * `task.blocker_reported` is deliberately NOT wired although it is tempting:
 * who should hear about a blocker — the workspace's humans? the goal's
 * owner? — is a policy question (§12), and answering it here would freeze a
 * decision that is not this module's to make.
 *
 * It lives in notification rather than in task because turning a fact into an
 * addressed message is the alerting responsibility of §5.13. It goes through
 * the bus, so no module import.
 */
@Injectable()
export class NotifyAssigneeOnTaskAssignedListener {
  private readonly logger = new Logger(NotifyAssigneeOnTaskAssignedListener.name);

  constructor(private readonly send: SendNotificationUseCase) {}

  /**
   * Both facts, and the second one is not an afterthought: `Task.create`
   * raises only `task.created`, so listening to `task.assigned` alone would
   * tell every later owner and never the first — while §4.6 is precisely
   * about the owner a task has *from creation*. The e2e caught it.
   */
  @OnEvent("task.created")
  @OnEvent("task.assigned")
  async handle(event: TaskAssigned | TaskCreated): Promise<void> {
    // A task always belongs to a workspace; the contract is nullable because
    // some facts sit above workspaces, so the narrowing is explicit here.
    if (event.workspaceId === null) {
      return;
    }

    const sent = await this.send.execute({
      workspaceId: event.workspaceId,
      kind: "SYSTEM_ALERT",
      scope: "DIRECT",
      title: "A task was assigned to you",
      body: `Task ${event.aggregateId} is now yours.`,
      taskId: event.aggregateId,
      createdByType: "SERVICE",
      createdById: "spline",
      recipients: [
        { actorType: event.assignee.type, actorId: event.assignee.actorId },
      ],
      payload: { taskId: event.aggregateId },
    });

    // Never discard the Result. Swallowing it is how "the assignee is told"
    // failed intermittently with no trace at all — the one failure mode this
    // codebase refuses everywhere else. Logged rather than thrown: not
    // telling someone must not undo the assignment that did happen.
    if (sent.isFailure) {
      this.logger.error(
        `Assignee not notified for task ${event.aggregateId}: ${sent.error.name} — ${sent.error.message}`,
      );
    }
  }
}
