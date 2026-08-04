-- CreateEnum
CREATE TYPE "PolicyScopeType" AS ENUM ('ORGANIZATION', 'WORKSPACE', 'REPOSITORY', 'GOAL', 'TASK');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('SECURITY', 'RUNTIME', 'GIT', 'VALIDATION', 'COST', 'EXTENSION');

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeType" "PolicyScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "type" "PolicyType" NOT NULL,
    "rule" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByType" "ActorType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policies_workspaceId_enabled_idx" ON "policies"("workspaceId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "policies_workspaceId_scopeType_scopeId_rule_key" ON "policies"("workspaceId", "scopeType", "scopeId", "rule");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
