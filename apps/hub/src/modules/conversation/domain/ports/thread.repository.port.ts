import { ActorRef } from "../../../identity/domain/actor";
import { Thread, ThreadStatus } from "../thread";

export interface ListThreadsFilter {
  /** Mandatory (§4.2): there is no unscoped listing. */
  workspaceId: string;
  /** Threads this actor is one of the two sides of. */
  participant?: ActorRef;
  status?: ThreadStatus;
  limit?: number;
}

export interface ThreadRepository {
  save(thread: Thread): Promise<void>;
  findById(id: string): Promise<Thread | null>;
  list(filter: ListThreadsFilter): Promise<Thread[]>;
  /**
   * §10.18a — open threads waiting on a task's outcome. It is what lets an
   * answer travel back to whoever asked, without the task module needing to
   * know conversations exist.
   */
  listAwaiting(taskId: string): Promise<Thread[]>;
}

export const THREAD_REPOSITORY = "conversation/ThreadRepository";
