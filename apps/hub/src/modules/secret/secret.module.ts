import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { IdentityModule } from "../identity/identity.module";
import {
  DeleteSecretUseCase,
  ResolveSecretsUseCase,
  StoreSecretUseCase,
} from "./application/secret.use-cases";
import { SECRET_CIPHER } from "./domain/ports/secret-cipher.port";
import { SECRET_REPOSITORY } from "./domain/ports/secret.repository.port";
import { AesGcmCipher } from "./infrastructure/aes-gcm.cipher";
import { PrismaSecretRepository } from "./infrastructure/prisma-secret.repository";
import { SecretController } from "./interface/secret.controller";

/**
 * §18.4 — the workspace's credentials.
 *
 * Global because the runtime module resolves secrets for a worker holding a
 * claimed command, and a provider's tokens resolve inside its OWN module —
 * the lesson the kernel doc records, met again.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [SecretController],
  providers: [
    { provide: SECRET_REPOSITORY, useClass: PrismaSecretRepository },
    {
      provide: SECRET_CIPHER,
      useFactory: (config: ConfigService) =>
        new AesGcmCipher(config.getOrThrow<string>("SECRET_ENCRYPTION_KEY")),
      inject: [ConfigService],
    },
    StoreSecretUseCase,
    ResolveSecretsUseCase,
    DeleteSecretUseCase,
  ],
  exports: [ResolveSecretsUseCase, SECRET_REPOSITORY],
})
export class SecretModule {}
