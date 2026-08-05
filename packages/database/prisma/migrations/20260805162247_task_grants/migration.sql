-- CreateTable
CREATE TABLE "task_grants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "task_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_grants_workspaceId_taskId_idx" ON "task_grants"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "task_grants_expiresAt_idx" ON "task_grants"("expiresAt");

-- AddForeignKey
ALTER TABLE "task_grants" ADD CONSTRAINT "task_grants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
