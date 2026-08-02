UPDATE agent_sessions AS session
SET "updatedAt" = COALESCE(
  (
    SELECT MAX(output."createdAt")
    FROM agent_session_outputs AS output
    WHERE output."sessionId" = session.id
  ),
  session."startedAt"
)
WHERE session.status = 'IDLE';
