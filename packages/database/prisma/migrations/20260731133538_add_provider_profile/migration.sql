-- CreateEnum
CREATE TYPE "SandboxModel" AS ENUM ('NONE', 'READ_ONLY', 'WORKSPACE_WRITE', 'FULL_ACCESS');

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "promptFormat" JSONB NOT NULL DEFAULT '{}',
    "approvalRules" JSONB NOT NULL DEFAULT '{}',
    "hookSupport" JSONB NOT NULL DEFAULT '[]',
    "sandboxModel" "SandboxModel" NOT NULL DEFAULT 'WORKSPACE_WRITE',
    "outputSchema" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_provider_key" ON "provider_profiles"("provider");
