import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { ChangeMembershipRoleUseCase } from "./application/change-membership-role.use-case";
import { GrantWorkspaceMembershipUseCase } from "./application/grant-workspace-membership.use-case";
import { InviteWorkspaceMemberUseCase } from "./application/invite-workspace-member.use-case";
import { IssueActorCredentialUseCase } from "./application/issue-actor-credential.use-case";
import {
  IssueTaskGrantUseCase,
  VerifyTaskGrantUseCase,
} from "./application/task-grant.use-cases";
import { PrismaTaskGrantRepository } from "./infrastructure/prisma-task-grant.repository";
import { LoginUseCase } from "./application/login.use-case";
import { PermissionsService } from "./application/permissions.service";
import { WORKSPACE_AUDIENCE_PROVIDER } from "./infrastructure/identity-workspace-audience.adapter";
import { RegisterUserUseCase } from "./application/register-user.use-case";
import { RevokeActorCredentialUseCase } from "./application/revoke-actor-credential.use-case";
import { RevokeWorkspaceMembershipUseCase } from "./application/revoke-workspace-membership.use-case";
import { VerifyActorTokenUseCase } from "./application/verify-actor-token.use-case";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  TASK_GRANT_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  USER_REPOSITORY,
  WORKSPACE_MEMBERSHIP_REPOSITORY,
} from "./domain/ports/identity.repository.ports";
import {
  PASSWORD_HASHER,
  SECRET_GENERATOR,
  TOKEN_SIGNER,
} from "./domain/ports/identity.service.ports";
import {
  BcryptPasswordHasher,
  CryptoSecretGenerator,
  JwtTokenSigner,
} from "./infrastructure/identity.services";
import {
  PrismaActorCredentialRepository,
  PrismaOrganizationRepository,
  PrismaUserRepository,
  PrismaWorkspaceMembershipRepository,
} from "./infrastructure/prisma-identity.repositories";
import { ActorAuthGuard } from "./interface/actor-auth.guard";
import { ActorRegistryController } from "./interface/actor-registry.controller";
import { AuthController } from "./interface/auth.controller";
import { OrganizationController } from "./interface/organization.controller";
import { PermissionsGuard } from "./interface/permissions.guard";
import { WorkspaceMemberController } from "./interface/workspace-member.controller";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: (config.get<string>("JWT_EXPIRES_IN") ??
            "1h") as `${number}${"s" | "m" | "h" | "d"}`,
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    ActorRegistryController,
    OrganizationController,
    WorkspaceMemberController,
  ],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
    {
      provide: WORKSPACE_MEMBERSHIP_REPOSITORY,
      useClass: PrismaWorkspaceMembershipRepository,
    },
    { provide: ACTOR_CREDENTIAL_REPOSITORY, useClass: PrismaActorCredentialRepository },
    { provide: TASK_GRANT_REPOSITORY, useClass: PrismaTaskGrantRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SIGNER, useClass: JwtTokenSigner },
    { provide: SECRET_GENERATOR, useClass: CryptoSecretGenerator },
    RegisterUserUseCase,
    LoginUseCase,
    IssueActorCredentialUseCase,
    RevokeActorCredentialUseCase,
    IssueTaskGrantUseCase,
    VerifyTaskGrantUseCase,
    VerifyActorTokenUseCase,
    GrantWorkspaceMembershipUseCase,
    InviteWorkspaceMemberUseCase,
    ChangeMembershipRoleUseCase,
    RevokeWorkspaceMembershipUseCase,
    PermissionsService,
    ActorAuthGuard,
    PermissionsGuard,
    WORKSPACE_AUDIENCE_PROVIDER,
  ],
  exports: [
    WORKSPACE_AUDIENCE_PROVIDER,
    // For `OrganizationFleetAdapter` (§6.3): the credential set is the
    // registry of non-human actors, so it is also the answer to "which
    // machines does this organization own?".
    ACTOR_CREDENTIAL_REPOSITORY,
    PermissionsService,
    ActorAuthGuard,
    PermissionsGuard,
    VerifyActorTokenUseCase,
    IssueActorCredentialUseCase,
    RevokeActorCredentialUseCase,
    IssueTaskGrantUseCase,
    VerifyTaskGrantUseCase,
    TASK_GRANT_REPOSITORY,
    GrantWorkspaceMembershipUseCase,
    InviteWorkspaceMemberUseCase,
    ChangeMembershipRoleUseCase,
    RevokeWorkspaceMembershipUseCase,
    WORKSPACE_MEMBERSHIP_REPOSITORY,
    ORGANIZATION_REPOSITORY,
    USER_REPOSITORY,
    TOKEN_SIGNER,
  ],
})
export class IdentityModule {}
