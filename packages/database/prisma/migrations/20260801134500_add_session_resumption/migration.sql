ALTER TABLE "agent_sessions"
ADD COLUMN "providerSessionId" TEXT,
ADD COLUMN "resumedFromSessionId" TEXT;

CREATE INDEX "agent_sessions_providerSessionId_idx"
ON "agent_sessions"("providerSessionId");

CREATE INDEX "agent_sessions_resumedFromSessionId_idx"
ON "agent_sessions"("resumedFromSessionId");

ALTER TABLE "agent_sessions"
ADD CONSTRAINT "agent_sessions_resumedFromSessionId_fkey"
FOREIGN KEY ("resumedFromSessionId") REFERENCES "agent_sessions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
