/**
 * "Which proofs does this workspace require, whatever the agent asked for?"
 *
 * §12.3 lists a Validation policy type — "build obligatoire, couverture
 * minimale, sécurité obligatoire". The rule belongs to the Policy Engine;
 * needing to know it belongs here, so this module declares the abstraction
 * and policy supplies it. Nothing in validation/ imports policy/.
 *
 * This is how §11.7's fourth condition ("aucune politique violée") is met
 * without a second refusal path: a mandated proof becomes an ordinary
 * mandatory Validation, and the completion check already written enforces it
 * knowing nothing about policies.
 */
export interface MandatedValidationsPort {
  mandatedFor(context: {
    workspaceId: string;
    goalId?: string;
    taskId: string;
  }): Promise<string[]>;
}
export const MANDATED_VALIDATIONS = "validation/MandatedValidationsPort";
