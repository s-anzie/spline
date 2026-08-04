-- CreateEnum
CREATE TYPE "LockStatus" AS ENUM ('HELD', 'RELEASED', 'EXPIRED');

-- CreateTable
CREATE TABLE "resource_locks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "activeKey" TEXT,
    "ownerType" "ActorType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LockStatus" NOT NULL DEFAULT 'HELD',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_locks_workspaceId_status_idx" ON "resource_locks"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "resource_locks_ownerType_ownerId_idx" ON "resource_locks"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_locks_workspaceId_activeKey_key" ON "resource_locks"("workspaceId", "activeKey");

-- AddForeignKey
ALTER TABLE "resource_locks" ADD CONSTRAINT "resource_locks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
