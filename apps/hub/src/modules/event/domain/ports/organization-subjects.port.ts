/**
 * §14, §4.2 — the things an organization's activity can be about.
 *
 * The organization's journal is not "every event with no workspace": that
 * would hand one operator every other operator's pairing requests. It is the
 * events whose actor or target is something this organization owns — itself,
 * the people and identities it holds, the machines it paired.
 *
 * Declared here and supplied by the modules that own those things, per the
 * inversion rule: the event module records facts and has no business knowing
 * what a credential or an enrolment is.
 */
export interface OrganizationSubjects {
  subjectIdsOf(organizationId: string): Promise<string[]>;
}

export const ORGANIZATION_SUBJECTS = "event/OrganizationSubjects";
