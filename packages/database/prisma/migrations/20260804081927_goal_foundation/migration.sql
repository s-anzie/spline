-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'BACKGROUND');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('PLANNED', 'ACTIVE', 'BLOCKED', 'REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentGoalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "successCriteria" JSONB NOT NULL DEFAULT '[]',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "ownerType" "ActorType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_workspaceId_status_idx" ON "goals"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "goals_parentGoalId_idx" ON "goals"("parentGoalId");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
