import { Global, Module } from "@nestjs/common";

import { AUDIT_TRAIL } from "../../kernel/domain/ports/audit-trail.port";
import { IdentityModule } from "../identity/identity.module";
import { RecordAuditEntryUseCase } from "./application/record-audit-entry.use-case";
import {
  ListAuditEntriesUseCase,
  VerifyAuditChainUseCase,
} from "./application/read-audit.use-cases";
import { AUDIT_REPOSITORY } from "./domain/ports/audit.repository.port";
import { PrismaAuditRepository } from "./infrastructure/prisma-audit.repository";
import { AuditController } from "./interface/audit.controller";

/**
 * @Global because AUDIT_TRAIL is consumed by identity, policy and workspace,
 * and Nest resolves a provider's tokens inside its own module — a binding
 * declared elsewhere would never reach them. The kernel declares the port and
 * deliberately does NOT bind it: one owner, no coin toss (kernel §7).
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [AuditController],
  providers: [
    { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository },
    RecordAuditEntryUseCase,
    { provide: AUDIT_TRAIL, useExisting: RecordAuditEntryUseCase },
    ListAuditEntriesUseCase,
    VerifyAuditChainUseCase,
  ],
  exports: [AUDIT_TRAIL],
})
export class AuditModule {}
