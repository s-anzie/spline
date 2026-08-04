-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DRAINING', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('STARTING', 'IDLE', 'RUNNING', 'WAITING', 'STOPPED', 'CRASHED');

-- CreateTable
CREATE TABLE "worker_nodes" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '[]',
    "architecture" TEXT NOT NULL,
    "operatingSystem" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "workspaceIds" JSONB NOT NULL DEFAULT '[]',
    "status" "WorkerStatus" NOT NULL DEFAULT 'ONLINE',
    "lastHeartbeatAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentType" "ActorType" NOT NULL,
    "agentId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "taskId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'STARTING',
    "lastHeartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "quotaUnavailableUntil" TIMESTAMP(3),
    "quotaReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_nodes_status_idx" ON "worker_nodes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "worker_nodes_hostname_key" ON "worker_nodes"("hostname");

-- CreateIndex
CREATE INDEX "agent_sessions_workspaceId_status_idx" ON "agent_sessions"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "agent_sessions_workerId_status_idx" ON "agent_sessions"("workerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_provider_key" ON "provider_profiles"("provider");

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
