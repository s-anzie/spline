import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { AnswerDelegationListener } from "./application/answer-delegation.listener";
import {
  DeliverOutcomeUseCase,
  OpenThreadUseCase,
  SpeakInThreadUseCase,
} from "./application/thread.use-cases";
import { THREAD_REPOSITORY } from "./domain/ports/thread.repository.port";
import { PrismaThreadRepository } from "./infrastructure/prisma-thread.repository";
import { ConversationController } from "./interface/conversation.controller";

/**
 * §10.18a-b — bounded exchanges between two actors, and the return path a
 * delegated result travels back along.
 *
 * It imports identity for its guards and nothing else. The listener that
 * answers a delegation reads a task fact STRUCTURALLY rather than importing
 * the task module: two modules with no reason to know each other stay
 * separable.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ConversationController],
  providers: [
    { provide: THREAD_REPOSITORY, useClass: PrismaThreadRepository },
    OpenThreadUseCase,
    SpeakInThreadUseCase,
    DeliverOutcomeUseCase,
    AnswerDelegationListener,
  ],
  exports: [THREAD_REPOSITORY],
})
export class ConversationModule {}
