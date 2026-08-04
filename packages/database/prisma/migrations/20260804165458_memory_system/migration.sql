-- CreateEnum
CREATE TYPE "MemoryScopeType" AS ENUM ('ORGANIZATION', 'WORKSPACE', 'REPOSITORY', 'GOAL', 'TASK', 'RUN', 'SESSION');

-- CreateTable
CREATE TABLE "memory_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeType" "MemoryScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "authorType" "ActorType" NOT NULL,
    "authorId" TEXT NOT NULL,
    "supersededById" TEXT,
    "forgottenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memory_entries_workspaceId_scopeType_scopeId_idx" ON "memory_entries"("workspaceId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "memory_entries_workspaceId_type_idx" ON "memory_entries"("workspaceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "memory_entries_workspaceId_scopeType_scopeId_sourceType_sou_key" ON "memory_entries"("workspaceId", "scopeType", "scopeId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
