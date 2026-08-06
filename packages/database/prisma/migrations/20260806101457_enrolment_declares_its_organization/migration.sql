-- AlterTable
ALTER TABLE "worker_enrolments" ADD COLUMN     "requestedOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "worker_enrolments_requestedOrganizationId_status_idx" ON "worker_enrolments"("requestedOrganizationId", "status");
