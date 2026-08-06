/**
 * §6.3 — which non-human actors an organization brought into being.
 *
 * Declared here and supplied by `identity`, per the inversion rule this
 * codebase follows everywhere. A `WorkerNode` carries no organization of its
 * own: what binds a machine to one is the credential issued when somebody
 * approved its enrolment, and only identity knows about credentials.
 *
 * Runtime asks the narrow question it actually has — "which machines are
 * mine?" — rather than borrowing a repository and deciding for itself what
 * membership means.
 */
export interface OrganizationFleet {
  /** The actor ids of every WORKER credential this organization ever issued. */
  machineActorIdsOf(organizationId: string): Promise<string[]>;
}

export const ORGANIZATION_FLEET = "runtime/OrganizationFleet";
