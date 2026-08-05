-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED', 'EXHAUSTED');

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "initiatorType" "ActorType" NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "participantType" "ActorType" NOT NULL,
    "participantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "taskId" TEXT,
    "turnBudget" INTEGER NOT NULL,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "outcome" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "threads_workspaceId_status_idx" ON "threads"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "threads_taskId_idx" ON "threads"("taskId");

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
