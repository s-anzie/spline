CREATE TYPE "SessionOutputStream" AS ENUM ('STDOUT', 'STDERR');

CREATE TABLE "agent_session_outputs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stream" "SessionOutputStream" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_session_outputs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_session_outputs_sessionId_sequence_key"
ON "agent_session_outputs"("sessionId", "sequence");

CREATE INDEX "agent_session_outputs_sessionId_createdAt_idx"
ON "agent_session_outputs"("sessionId", "createdAt");

ALTER TABLE "agent_session_outputs"
ADD CONSTRAINT "agent_session_outputs_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
