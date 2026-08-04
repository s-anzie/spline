-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PLANNED', 'READY', 'ASSIGNED', 'RUNNING', 'BLOCKED', 'VALIDATING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "dependsOnTaskIds" JSONB NOT NULL DEFAULT '[]',
    "blockers" JSONB NOT NULL DEFAULT '[]',
    "assigneeType" "ActorType" NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'PLANNED',
    "statusBeforeBlock" "TaskStatus",
    "estimatedCost" DOUBLE PRECISION,
    "estimatedDurationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_workspaceId_status_idx" ON "tasks"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "tasks_goalId_idx" ON "tasks"("goalId");

-- CreateIndex
CREATE INDEX "tasks_assigneeType_assigneeId_idx" ON "tasks"("assigneeType", "assigneeId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
