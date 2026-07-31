import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtSignOptions } from "@nestjs/jwt";

import { AssignWorkspaceRoleUseCase } from "./application/assign-workspace-role.use-case";
import { IssueAgentTokenUseCase } from "./application/issue-agent-token.use-case";
import { LoginUseCase } from "./application/login.use-case";
import { PermissionsService } from "./application/permissions.service";
import { PASSWORD_HASHER } from "./application/ports/password-hasher.port";
import { TOKEN_SERVICE } from "./application/ports/token-service.port";
import { RegisterUserUseCase } from "./application/register-user.use-case";
import { VerifyAgentTokenUseCase } from "./application/verify-agent-token.use-case";
import { AGENT_CREDENTIAL_REPOSITORY } from "./domain/ports/agent-credential.repository.port";
import { USER_REPOSITORY } from "./domain/ports/user.repository.port";
import { WORKSPACE_MEMBERSHIP_REPOSITORY } from "./domain/ports/workspace-membership.repository.port";
import { BcryptPasswordHasher } from "./infrastructure/bcrypt-password-hasher";
import { JwtTokenService } from "./infrastructure/jwt-token.service";
import { PrismaAgentCredentialRepository } from "./infrastructure/prisma-agent-credential.repository";
import { PrismaUserRepository } from "./infrastructure/prisma-user.repository";
import { PrismaWorkspaceMembershipRepository } from "./infrastructure/prisma-workspace-membership.repository";
import { AuthController } from "./interface/auth.controller";
import { JwtAuthGuard } from "./interface/jwt-auth.guard";
import { PermissionsGuard } from "./interface/permissions.guard";
import { RequesterResolver } from "./interface/requester-resolver";

/**
 * Global: virtually every future module (Workspace, Goal, Task, Agent,
 * Process, ResourceLock, Decision, Event, Notification) needs JwtAuthGuard /
 * PermissionsGuard on its controllers. Nest resolves a guard referenced via
 * @UseGuards(SomeGuard) by re-walking its *entire* constructor dependency
 * tree from the consuming module's injector (not just handing over the
 * already-built singleton like normal constructor injection does) — so every
 * token that tree touches, transitively, has to be exported here too, not
 * just the guard classes themselves.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.getOrThrow<string>("JWT_EXPIRES_IN") as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    RegisterUserUseCase,
    LoginUseCase,
    AssignWorkspaceRoleUseCase,
    IssueAgentTokenUseCase,
    VerifyAgentTokenUseCase,
    PermissionsService,
    RequesterResolver,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: WORKSPACE_MEMBERSHIP_REPOSITORY, useClass: PrismaWorkspaceMembershipRepository },
    { provide: AGENT_CREDENTIAL_REPOSITORY, useClass: PrismaAgentCredentialRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
  ],
  exports: [
    AssignWorkspaceRoleUseCase,
    IssueAgentTokenUseCase,
    VerifyAgentTokenUseCase,
    PermissionsService,
    RequesterResolver,
    JwtAuthGuard,
    PermissionsGuard,
    // Transitively required by JwtAuthGuard / PermissionsGuard when Nest
    // resolves them for @UseGuards() in another module — see comment above.
    WORKSPACE_MEMBERSHIP_REPOSITORY,
    AGENT_CREDENTIAL_REPOSITORY,
    PASSWORD_HASHER,
    TOKEN_SERVICE,
  ],
})
export class IdentityModule {}
