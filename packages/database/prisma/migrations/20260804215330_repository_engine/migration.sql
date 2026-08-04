-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BranchKind" AS ENUM ('TASK', 'GOAL', 'AGENT', 'PROTECTED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('OPEN', 'MERGED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WorktreeStatus" AS ENUM ('OPEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "extraProtectedBranches" JSONB NOT NULL DEFAULT '[]',
    "status" "RepositoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "BranchKind" NOT NULL,
    "taskId" TEXT,
    "goalId" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worktrees" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "branchId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "openForTask" TEXT,
    "path" TEXT NOT NULL,
    "status" "WorktreeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worktrees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_requests" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "sourceBranchId" TEXT NOT NULL,
    "targetBranchId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "MergeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByType" "ActorType" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedByType" "ActorType",
    "decidedById" TEXT,
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "mergedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merge_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repositories_workspaceId_status_idx" ON "repositories"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_workspaceId_name_key" ON "repositories"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "branches_repositoryId_status_idx" ON "branches"("repositoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branches_repositoryId_name_key" ON "branches"("repositoryId", "name");

-- CreateIndex
CREATE INDEX "worktrees_repositoryId_status_idx" ON "worktrees"("repositoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "worktrees_repositoryId_openForTask_key" ON "worktrees"("repositoryId", "openForTask");

-- CreateIndex
CREATE INDEX "merge_requests_repositoryId_status_idx" ON "merge_requests"("repositoryId", "status");

-- CreateIndex
CREATE INDEX "merge_requests_taskId_idx" ON "merge_requests"("taskId");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worktrees" ADD CONSTRAINT "worktrees_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
