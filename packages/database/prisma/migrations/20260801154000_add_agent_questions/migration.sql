CREATE TYPE "AgentQuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'ACKNOWLEDGED', 'CLOSED');

CREATE TABLE "agent_questions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "askerAgentId" TEXT NOT NULL,
  "managerAgentId" TEXT NOT NULL,
  "sessionId" TEXT,
  "question" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "recommendation" TEXT,
  "blocking" BOOLEAN NOT NULL DEFAULT true,
  "status" "AgentQuestionStatus" NOT NULL DEFAULT 'OPEN',
  "answer" TEXT,
  "answeredByAgentId" TEXT,
  "answeredAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_questions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "agent_questions_workspaceId_status_createdAt_idx" ON "agent_questions"("workspaceId", "status", "createdAt");
CREATE INDEX "agent_questions_askerAgentId_status_idx" ON "agent_questions"("askerAgentId", "status");
CREATE INDEX "agent_questions_managerAgentId_status_idx" ON "agent_questions"("managerAgentId", "status");
