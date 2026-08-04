import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { DisablePolicyUseCase } from "../application/disable-policy.use-case";
import { ListPoliciesUseCase } from "../application/list-policies.use-case";
import { ResolveEffectivePoliciesUseCase } from "../application/resolve-effective-policies.use-case";
import { SetPolicyUseCase } from "../application/set-policy.use-case";
import { Policy } from "../domain/policy";
import {
  ListPoliciesQueryDto,
  ResolvePoliciesQueryDto,
  SetPolicyDto,
} from "./dto/policy.dtos";

function toView(policy: Policy) {
  return {
    id: policy.id.value,
    workspaceId: policy.workspaceId,
    scope: { type: policy.scopeType, id: policy.scopeId },
    type: policy.type,
    rule: policy.rule,
    value: policy.value,
    enabled: policy.enabled,
    createdBy: { type: policy.createdBy.type, id: policy.createdBy.actorId },
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/policies")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class PolicyController {
  constructor(
    private readonly setPolicy: SetPolicyUseCase,
    private readonly disablePolicy: DisablePolicyUseCase,
    private readonly listPolicies: ListPoliciesUseCase,
    private readonly resolve: ResolveEffectivePoliciesUseCase,
  ) {}

  /** Policies are the workspace's rules — the permission that governs them. */
  @Post()
  @RequirePermission("manage_workspace")
  async set(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: SetPolicyDto,
  ): Promise<{ policyId: string }> {
    const result = await this.setPolicy.execute({
      workspaceId,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId,
      type: dto.type,
      rule: dto.rule,
      value: dto.value,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListPoliciesQueryDto,
  ) {
    const result = await this.listPolicies.execute({
      workspaceId,
      type: query.type,
      scopeType: query.scopeType,
      includeDisabled: query.includeDisabled,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toView);
  }

  /**
   * §12.2 — what actually applies in a given context, with the scope that
   * decided each rule. An agent reads this to know the rules it works under
   * before acting, rather than discovering them through a refusal.
   */
  @Get("effective")
  @RequirePermission("read_workspace_state")
  async effective(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ResolvePoliciesQueryDto,
  ) {
    const result = await this.resolve.execute({
      workspaceId,
      organizationId: query.organizationId,
      repositoryId: query.repositoryId,
      goalId: query.goalId,
      taskId: query.taskId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /** No delete route: §18.7 forbids erasing what governed past decisions. */
  @Post(":policyId/disable")
  @HttpCode(200)
  @RequirePermission("manage_workspace")
  async disable(
    @Param("workspaceId") workspaceId: string,
    @Param("policyId") policyId: string,
    @CurrentActor() actor: ActorIdentity,
  ): Promise<{ ok: true }> {
    const result = await this.disablePolicy.execute({
      workspaceId,
      policyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }
}
