-- The application serializes launches in one API process, while this partial
-- unique index is the final cross-process guard. IDLE is intentionally not
-- included: it is a parked conversation, not a running provider instance.
CREATE UNIQUE INDEX "agent_sessions_one_executing_per_agent"
ON "agent_sessions" ("agentId")
WHERE "status" IN ('STARTING', 'RUNNING', 'AWAITING_APPROVAL');
