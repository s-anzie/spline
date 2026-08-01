/*
  Warnings:

  - You are about to drop the column `channel` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `message` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `readAt` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `recipientId` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `recipientType` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `notifications` table. All the data in the column will be lost.
  - Added the required column `body` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdBy` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kind` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scope` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('CHAT_MESSAGE', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "NotificationScope" AS ENUM ('DIRECT', 'BROADCAST');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'SEEN', 'ACKNOWLEDGED', 'ACTED_ON', 'FAILED');

-- DropIndex
DROP INDEX "notifications_recipientType_recipientId_idx";

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "channel",
DROP COLUMN "message",
DROP COLUMN "readAt",
DROP COLUMN "recipientId",
DROP COLUMN "recipientType",
DROP COLUMN "type",
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "createdBy" JSONB NOT NULL,
ADD COLUMN     "kind" "NotificationKind" NOT NULL,
ADD COLUMN     "payload" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "scope" "NotificationScope" NOT NULL,
ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "title" TEXT;

-- DropEnum
DROP TYPE "NotificationChannel";

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientType" "ActorType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "actionTakenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_recipients_notificationId_idx" ON "notification_recipients"("notificationId");

-- CreateIndex
CREATE INDEX "notification_recipients_recipientType_recipientId_readAt_idx" ON "notification_recipients"("recipientType", "recipientId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notificationId_recipientType_recipi_key" ON "notification_recipients"("notificationId", "recipientType", "recipientId");

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
