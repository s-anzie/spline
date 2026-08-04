import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GrantWorkspaceMembershipUseCase } from "../../identity/application/grant-workspace-membership.use-case";
import { OrganizationNotFoundError } from "../../identity/domain/identity.errors";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../../identity/domain/ports/identity.repository.ports";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import {
  CreateWorkspaceError,
  Workspace,
  WorkspaceSettings,
} from "../domain/workspace";
import { NotOrganizationOwnerError } from "../domain/workspace.errors";

export interface CreateWorkspaceInput {
  organizationId: string;
  name: string;
  description?: string;
  settings?: WorkspaceSettings;
  creatorUserId: string;
}

export interface CreateWorkspaceOutput {
  workspaceId: string;
  slug: string;
}

export type CreateWorkspaceUseCaseError =
  | CreateWorkspaceError
  | OrganizationNotFoundError
  | NotOrganizationOwnerError
  | Error;

/**
 * Creating a workspace founds its isolation: the same use-case grants the
 * creator the OWNER membership (bootstrap operation "workspace-create",
 * §18.8). No cross-aggregate transaction — on a failed grant the freshly
 * created workspace is compensated away so no owner-less workspace can
 * exist (§4.2 invariant).
 */
@Injectable()
export class CreateWorkspaceUseCase
  implements
    UseCase<CreateWorkspaceInput, Result<CreateWorkspaceOutput, CreateWorkspaceUseCaseError>>
{
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    private readonly grantMembership: GrantWorkspaceMembershipUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: CreateWorkspaceInput,
  ): Promise<Result<CreateWorkspaceOutput, CreateWorkspaceUseCaseError>> {
    const organization = await this.organizations.findById(input.organizationId);
    if (!organization) {
      return Result.fail(new OrganizationNotFoundError(input.organizationId));
    }
    if (organization.ownerId !== input.creatorUserId) {
      return Result.fail(new NotOrganizationOwnerError());
    }

    const workspace = Workspace.create({
      organizationId: input.organizationId,
      name: input.name,
      ...(input.description !== undefined && { description: input.description }),
      ...(input.settings !== undefined && { settings: input.settings }),
      now: this.clock.now(),
    });
    if (workspace.isFailure) {
      return Result.fail(workspace.error);
    }

    await this.workspaces.save(workspace.value);
    try {
      const granted = await this.grantMembership.execute({
        actorType: "HUMAN",
        actorId: input.creatorUserId,
        workspaceId: workspace.value.id.value,
        role: "OWNER",
      });
      if (granted.isFailure) {
        await this.workspaces.delete(workspace.value.id.value);
        return Result.fail(granted.error);
      }
    } catch (error) {
      await this.workspaces.delete(workspace.value.id.value);
      throw error;
    }

    await flushDomainEvents(workspace.value, this.publisher);
    return Result.ok({
      workspaceId: workspace.value.id.value,
      slug: workspace.value.slug,
    });
  }
}
