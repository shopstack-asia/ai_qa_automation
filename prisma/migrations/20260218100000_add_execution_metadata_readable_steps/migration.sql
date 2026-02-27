-- AlterTable
ALTER TABLE "Execution" ADD COLUMN IF NOT EXISTS "execution_metadata" JSONB;
ALTER TABLE "Execution" ADD COLUMN IF NOT EXISTS "readable_steps" JSONB;
