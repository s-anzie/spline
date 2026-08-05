-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CLAIMED');

-- CreateTable
CREATE TABLE "worker_enrolments" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "hostname" TEXT NOT NULL,
    "architecture" TEXT NOT NULL,
    "operatingSystem" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "labels" JSONB NOT NULL DEFAULT '[]',
    "code" TEXT NOT NULL,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_enrolments_status_idx" ON "worker_enrolments"("status");

-- CreateIndex
CREATE INDEX "worker_enrolments_organizationId_idx" ON "worker_enrolments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_enrolments_code_key" ON "worker_enrolments"("code");

-- AddForeignKey
ALTER TABLE "worker_enrolments" ADD CONSTRAINT "worker_enrolments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
