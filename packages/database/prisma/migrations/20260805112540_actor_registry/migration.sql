/*
  Warnings:

  - Added the required column `displayName` to the `actor_credentials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `actor_credentials` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "actor_credentials" ADD COLUMN     "displayName" TEXT NOT NULL,
ADD COLUMN     "organizationId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "actor_credentials_organizationId_idx" ON "actor_credentials"("organizationId");

-- AddForeignKey
ALTER TABLE "actor_credentials" ADD CONSTRAINT "actor_credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
