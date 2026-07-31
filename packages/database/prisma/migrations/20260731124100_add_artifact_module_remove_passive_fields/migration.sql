/*
  Warnings:

  - You are about to drop the column `linkedArtifacts` on the `goals` table. All the data in the column will be lost.
  - You are about to drop the column `artifacts` on the `tasks` table. All the data in the column will be lost.
  - You are about to drop the column `artifacts` on the `workspaces` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('FILE', 'NOTE', 'SPEC', 'DIFF', 'SCREENSHOT', 'LOG', 'DOCUMENT', 'DECISION_EXPORT', 'BUNDLE');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "goals" DROP COLUMN "linkedArtifacts";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "artifacts";

-- AlterTable
ALTER TABLE "workspaces" DROP COLUMN "artifacts";

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT,
    "taskId" TEXT,
    "decisionId" TEXT,
    "processId" TEXT,
    "type" "ArtifactType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "versions" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "contentRef" TEXT,
    "checksum" TEXT,
    "createdByType" "ActorType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedByType" "ActorType",
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artifacts_workspaceId_idx" ON "artifacts"("workspaceId");

-- CreateIndex
CREATE INDEX "artifacts_goalId_idx" ON "artifacts"("goalId");

-- CreateIndex
CREATE INDEX "artifacts_taskId_idx" ON "artifacts"("taskId");

-- CreateIndex
CREATE INDEX "artifacts_decisionId_idx" ON "artifacts"("decisionId");

-- CreateIndex
CREATE INDEX "artifacts_processId_idx" ON "artifacts"("processId");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
