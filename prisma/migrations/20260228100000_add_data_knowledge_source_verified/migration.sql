-- AlterTable: add source, verified, previously_passed to DataKnowledge for failure classification (DATA_NOT_VERIFIED / FAILED_UNVERIFIED_DATA).
ALTER TABLE "DataKnowledge" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "DataKnowledge" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN DEFAULT true;
ALTER TABLE "DataKnowledge" ADD COLUMN IF NOT EXISTS "previously_passed" BOOLEAN DEFAULT false;
