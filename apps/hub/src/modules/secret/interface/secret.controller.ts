import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorRef } from "../../identity/domain/actor";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  DeleteSecretUseCase,
  StoreSecretUseCase,
} from "../application/secret.use-cases";
import {
  SECRET_REPOSITORY,
  SecretRepository,
} from "../domain/ports/secret.repository.port";

export class StoreSecretDto {
  /**
   * Constrained because it becomes an environment variable. A name carrying
   * `=` or a newline would let whoever chose it inject a second variable.
   */
  @Matches(/^[A-Z][A-Z0-9_]{0,63}$/, {
    message:
      "name must look like an environment variable: A-Z, digits and underscores, starting with a letter",
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  value!: string;
}

export class ListSecretsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * §18.4 — managing a workspace's secrets.
 *
 * `manage_workspace` throughout, which in the matrix is OWNER alone. Not
 * `operate_workspace`: an operator runs the workspace, an owner decides what
 * credentials it holds, and the two are different questions.
 *
 * **There is no route that returns a value.** Listing gives names and
 * metadata; the only path a value ever takes out of this system is to a
 * worker holding a claimed command, through the runtime module, audited.
 */
@Controller("workspaces/:workspaceId/secrets")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class SecretController {
  constructor(
    private readonly storeSecret: StoreSecretUseCase,
    private readonly deleteSecret: DeleteSecretUseCase,
    @Inject(SECRET_REPOSITORY) private readonly secrets: SecretRepository,
  ) {}

  /** Stores or rotates. Same route, because a caller should not have to know. */
  @Post()
  @HttpCode(200)
  @RequirePermission("manage_workspace")
  async store(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: StoreSecretDto,
  ): Promise<{ name: string; rotated: boolean }> {
    const result = await this.storeSecret.execute({
      workspaceId,
      name: dto.name,
      value: dto.value,
      actor: ActorRef.create(actor.actorType, actor.actorId).value,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { name: dto.name, rotated: result.value.rotated };
  }

  /**
   * Names and metadata. §17.8 asks for the named detail rather than a count,
   * and here the detail an operator needs is which credentials exist and when
   * each was last used — never what they are.
   */
  @Get()
  @RequirePermission("manage_workspace")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListSecretsQueryDto,
  ) {
    const secrets = await this.secrets.listNames(workspaceId, query.limit);
    return secrets.map((secret) => ({
      name: secret.name,
      createdBy: { type: secret.createdBy.type, id: secret.createdBy.actorId },
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
      lastAccessedAt: secret.lastAccessedAt?.toISOString() ?? null,
    }));
  }

  @Delete(":name")
  @HttpCode(200)
  @RequirePermission("manage_workspace")
  async remove(
    @Param("workspaceId") workspaceId: string,
    @Param("name") name: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteSecret.execute({ workspaceId, name });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }
}
