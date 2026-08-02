ALTER TYPE "AgentSessionStatus" ADD VALUE IF NOT EXISTS 'IDLE' AFTER 'RUNNING';

WITH latest_completed AS (
  SELECT DISTINCT ON ("workspaceId", "agentId") id
  FROM agent_sessions
  WHERE status = 'COMPLETED'
  ORDER BY "workspaceId", "agentId", "startedAt" DESC
)
UPDATE agent_sessions
SET status = 'IDLE', "endedAt" = NULL, "updatedAt" = now()
WHERE id IN (SELECT id FROM latest_completed);
