ALTER TABLE "provider_profiles"
ADD COLUMN "quotaUnavailableUntil" TIMESTAMP(3),
ADD COLUMN "quotaReason" TEXT;
