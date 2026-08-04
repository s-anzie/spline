import { Validation, ValidationStatus } from "../validation";

export interface ListValidationsFilter {
  /** Mandatory (§4.2): there is no unscoped listing. */
  workspaceId: string;
  taskId?: string;
  statuses?: readonly ValidationStatus[];
  mandatoryOnly?: boolean;
  /** Absent means one page, never the whole table (kernel pagination). */
  limit?: number;
}

export interface ValidationRepository {
  save(validation: Validation): Promise<void>;
  findById(id: string): Promise<Validation | null>;
  list(filter: ListValidationsFilter): Promise<Validation[]>;
  /** Every validation attached to a task — the input of the §11.7 evaluation. */
  listByTask(taskId: string): Promise<Validation[]>;
}
export const VALIDATION_REPOSITORY = "validation/ValidationRepository";
