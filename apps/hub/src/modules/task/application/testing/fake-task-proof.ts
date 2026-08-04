import { TaskProofPort } from "../../domain/ports/task-proof.port";

/** By default nothing is outstanding: tests opt in to missing proof. */
export class FakeTaskProof implements TaskProofPort {
  private readonly missing = new Map<string, { id: string; type: string }[]>();

  require(taskId: string, missing: { id: string; type: string }[]): void {
    this.missing.set(taskId, missing);
  }

  readonly requested: { taskId: string; types: readonly string[] }[] = [];

  async unsatisfiedMandatory(taskId: string): Promise<{ id: string; type: string }[]> {
    return this.missing.get(taskId) ?? [];
  }

  async requestOnSubmit(input: {
    taskId: string;
    types: readonly string[];
  }): Promise<void> {
    this.requested.push({ taskId: input.taskId, types: input.types });
  }
}
