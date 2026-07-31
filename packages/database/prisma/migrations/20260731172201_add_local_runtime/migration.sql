-- CreateEnum
CREATE TYPE "LocalMachineRuntimeStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('STARTING', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CRASHED', 'STOPPED');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "RuntimeCommandType" AS ENUM ('START_PROCESS', 'STOP_PROCESS', 'START_SESSION', 'STOP_SESSION');

-- CreateEnum
CREATE TYPE "RuntimeCommandStatus" AS ENUM ('PENDING', 'SENT', 'ACKNOWLEDGED', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "machineId" TEXT,
ADD COLUMN     "ownerSessionId" TEXT,
ADD COLUMN     "pid" INTEGER;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "rootPath" TEXT;

-- CreateTable
CREATE TABLE "machine_credentials" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "machine_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_machines" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "workspaceIds" JSONB NOT NULL DEFAULT '[]',
    "runtimeStatus" "LocalMachineRuntimeStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'STARTING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3),
    "currentProcessId" TEXT,
    "currentTaskId" TEXT,
    "approvalState" "ApprovalState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_commands" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "RuntimeCommandType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "RuntimeCommandStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "runtime_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machine_credentials_machineId_key" ON "machine_credentials"("machineId");

-- CreateIndex
CREATE INDEX "agent_sessions_workspaceId_idx" ON "agent_sessions"("workspaceId");

-- CreateIndex
CREATE INDEX "agent_sessions_agentId_idx" ON "agent_sessions"("agentId");

-- CreateIndex
CREATE INDEX "agent_sessions_machineId_idx" ON "agent_sessions"("machineId");

-- CreateIndex
CREATE INDEX "runtime_commands_machineId_status_idx" ON "runtime_commands"("machineId", "status");

-- CreateIndex
CREATE INDEX "processes_machineId_idx" ON "processes"("machineId");

-- CreateIndex
CREATE INDEX "processes_ownerSessionId_idx" ON "processes"("ownerSessionId");

-- AddForeignKey
ALTER TABLE "machine_credentials" ADD CONSTRAINT "machine_credentials_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "local_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "local_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processes" ADD CONSTRAINT "processes_ownerSessionId_fkey" FOREIGN KEY ("ownerSessionId") REFERENCES "agent_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processes" ADD CONSTRAINT "processes_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "local_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "local_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
