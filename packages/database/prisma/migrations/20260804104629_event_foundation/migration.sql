-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventReceiptStatus" AS ENUM ('PENDING', 'SEEN', 'ACKNOWLEDGED', 'ACTED');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'INFO',
    "actorType" "ActorType",
    "actorId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "sequence" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_receipts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" "EventReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "seenAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_workspaceId_sequence_idx" ON "events"("workspaceId", "sequence");

-- CreateIndex
CREATE INDEX "events_type_idx" ON "events"("type");

-- CreateIndex
CREATE INDEX "events_targetType_targetId_idx" ON "events"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "event_receipts_actorType_actorId_status_idx" ON "event_receipts"("actorType", "actorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_receipts_eventId_actorType_actorId_key" ON "event_receipts"("eventId", "actorType", "actorId");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_receipts" ADD CONSTRAINT "event_receipts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
