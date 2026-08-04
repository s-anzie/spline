-- CreateEnum
CREATE TYPE "DecisionConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "artifacts" ADD COLUMN     "decisionId" TEXT;

-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT,
    "subject" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "alternatives" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT NOT NULL,
    "confidence" "DecisionConfidence" NOT NULL DEFAULT 'MEDIUM',
    "authorType" "ActorType" NOT NULL,
    "authorId" TEXT NOT NULL,
    "supersededByDecisionId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decisions_workspaceId_idx" ON "decisions"("workspaceId");

-- CreateIndex
CREATE INDEX "decisions_taskId_idx" ON "decisions"("taskId");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_supersededByDecisionId_fkey" FOREIGN KEY ("supersededByDecisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
