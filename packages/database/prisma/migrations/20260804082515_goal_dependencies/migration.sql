-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "dependsOnGoalIds" JSONB NOT NULL DEFAULT '[]';
