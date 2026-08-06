-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refresh_sessions_userId_idx" ON "refresh_sessions"("userId");

-- CreateIndex
CREATE INDEX "refresh_sessions_familyId_idx" ON "refresh_sessions"("familyId");

-- CreateIndex
CREATE INDEX "refresh_sessions_expiresAt_idx" ON "refresh_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
