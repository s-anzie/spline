-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateTable
CREATE TABLE "validations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "requestedByType" "ActorType" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "executedByType" "ActorType",
    "executedById" TEXT,
    "output" TEXT,
    "reportArtifactIds" JSONB NOT NULL DEFAULT '[]',
    "dependsOnValidationIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "validations_workspaceId_taskId_idx" ON "validations"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "validations_taskId_status_idx" ON "validations"("taskId", "status");

-- AddForeignKey
ALTER TABLE "validations" ADD CONSTRAINT "validations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validations" ADD CONSTRAINT "validations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
