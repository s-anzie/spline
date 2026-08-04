-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "sequence" BIGSERIAL NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entries_workspaceId_sequence_idx" ON "audit_entries"("workspaceId", "sequence");

-- CreateIndex
CREATE INDEX "audit_entries_action_idx" ON "audit_entries"("action");

-- CreateIndex
CREATE INDEX "audit_entries_targetType_targetId_idx" ON "audit_entries"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
