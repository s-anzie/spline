-- A manager-created goal keeps the intake task that caused it to exist.
-- Nullable preserves goals stated directly by a person and existing rows.
ALTER TABLE "goals" ADD COLUMN "sourceTaskId" TEXT;

CREATE INDEX "goals_sourceTaskId_idx" ON "goals"("sourceTaskId");
