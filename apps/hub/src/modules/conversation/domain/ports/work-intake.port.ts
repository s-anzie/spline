import { ActorRef } from "../../../identity/domain/actor";
import { Result } from "../../../../kernel/domain/result";
import { DomainError } from "../../../../kernel/domain/domain-error";

/**
 * §4.5, §4.6, §10.18a — turning a stated need into work somebody holds.
 *
 * Declared by conversation because the act starts there: you open a thread
 * with somebody and say what you need. Supplied by the side that owns goals
 * and tasks, because conversation has no business knowing that a task must
 * serve a goal, nor which goal a request belongs under.
 *
 * The thread is not decoration. It is what links the question to its answer:
 * a thread carrying a task is told what became of that task (§10.18a), which
 * is how the person who asked is answered without polling anything.
 */
export interface WorkIntake {
  openRequest(input: {
    workspaceId: string;
    /** The need, in the words of whoever stated it. Never edited. */
    need: string;
    /** Who will organise it. Checked to be able to, before anything is made. */
    manager: ActorRef;
    /**
     * Who asked.
     *
     * A task carries no requester field today, so this owns the standing goal
     * instead — and the thread that carries the task names them as its
     * initiator, which is what actually answers "who wanted this" and gets
     * them told when it ends.
     */
    asker: ActorRef;
  }): Promise<Result<{ taskId: string }, DomainError>>;
}

export const WORK_INTAKE = "conversation/WorkIntake";
