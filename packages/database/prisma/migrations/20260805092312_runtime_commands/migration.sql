-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "runtime_commands" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "result" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runtime_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "runtime_commands_workerId_status_idx" ON "runtime_commands"("workerId", "status");

-- CreateIndex
CREATE INDEX "runtime_commands_workspaceId_status_idx" ON "runtime_commands"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
