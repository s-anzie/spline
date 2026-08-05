-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'VALIDATING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "workerId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" JSONB NOT NULL DEFAULT '[]',
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "runs_workspaceId_status_idx" ON "runs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "runs_taskId_idx" ON "runs"("taskId");

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
