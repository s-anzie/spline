-- A collaboration activity is durable while IDLE: waking it must reuse the
-- same row rather than create a second agent identity/conversation.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "agentId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS position
  FROM "agent_sessions"
  WHERE "status" IN ('STARTING', 'RUNNING', 'IDLE', 'AWAITING_APPROVAL')
)
UPDATE "agent_sessions" AS session
SET
  "status" = 'COMPLETED',
  "endedAt" = COALESCE(session."endedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE session."id" = ranked."id"
  AND ranked.position > 1;

DROP INDEX IF EXISTS "agent_sessions_one_executing_per_agent";

CREATE UNIQUE INDEX "agent_sessions_one_ongoing_per_agent"
ON "agent_sessions" ("agentId")
WHERE "status" IN ('STARTING', 'RUNNING', 'IDLE', 'AWAITING_APPROVAL');
