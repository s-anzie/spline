import { Global, Inject, Injectable, Module } from "@nestjs/common";

import {
  ORGANIZATION_SUBJECTS,
  OrganizationSubjects,
} from "../../event/domain/ports/organization-subjects.port";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  ActorCredentialRepository,
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../../identity/domain/ports/identity.repository.ports";
import { IdentityModule } from "../../identity/identity.module";
import {
  ENROLMENT_STORE,
  EnrolmentStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";
import { RuntimeModule } from "../runtime.module";

/**
 * §14 — what this organization's activity can be about.
 *
 * Four sources, because four modules own the things an organization does:
 * itself and its owner (identity), the identities it issued (identity), the
 * machines those identities registered (runtime), and every pairing request
 * it was knocked on with (runtime).
 *
 * It is a list of ids rather than a clever query because the journal records
 * facts about *things*, and only the modules that own those things can say
 * which ones are this organization's. An event never learned to be scoped by
 * organization, and teaching it would mean every publisher in the system
 * remembering to say so — a rule that is wrong the first time somebody
 * forgets, silently.
 */
@Injectable()
export class OrganizationSubjectsAdapter implements OrganizationSubjects {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ACTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ActorCredentialRepository,
    @Inject(ENROLMENT_STORE) private readonly enrolments: EnrolmentStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
  ) {}

  async subjectIdsOf(organizationId: string): Promise<string[]> {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      return [];
    }

    const credentials = await this.credentials.listByOrganization(organizationId);
    const actorIds = [...new Set(credentials.map((held) => held.actor.actorId))];
    const machines = await this.workers.listRegisteredBy(actorIds);
    const enrolments = await this.enrolments.listForOrganization(organizationId);

    return [
      // The organization itself: created, renamed.
      organizationId,
      // Its owner: registered. Nobody else's registration is here, because
      // nobody else's user id is.
      organization.ownerId,
      // The identities it issued, by credential and by actor: issued, revoked,
      // and everything those actors did outside a workspace.
      ...credentials.map((held) => held.id.value),
      ...actorIds,
      // The machines those identities registered.
      ...machines.map((machine) => machine.id.value),
      // And every request it was knocked on with, decided or not.
      ...enrolments.map((enrolment) => enrolment.id.value),
    ];
  }
}

/**
 * Global, and importing both modules it borrows from: a provider module that
 * does not import the modules its adapter needs resolves to nothing at
 * runtime — the trap recorded in the kernel doc.
 */
@Global()
@Module({
  imports: [IdentityModule, RuntimeModule],
  providers: [
    OrganizationSubjectsAdapter,
    { provide: ORGANIZATION_SUBJECTS, useExisting: OrganizationSubjectsAdapter },
  ],
  exports: [ORGANIZATION_SUBJECTS],
})
export class OrganizationSubjectsModule {}
