-- CreateEnum
CREATE TYPE "EventReceiptStatus" AS ENUM ('SEEN', 'ACKNOWLEDGED', 'ACTED');

-- CreateTable
CREATE TABLE "event_receipts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" "EventReceiptStatus" NOT NULL,
    "seenAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),

    CONSTRAINT "event_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_receipts_eventId_idx" ON "event_receipts"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_receipts_eventId_actorType_actorId_key" ON "event_receipts"("eventId", "actorType", "actorId");

-- AddForeignKey
ALTER TABLE "event_receipts" ADD CONSTRAINT "event_receipts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
