-- AlterTable: add tokenLast4 to ApiKeyRequestLog (last 4 chars of Bearer token for display)
ALTER TABLE "ApiKeyRequestLog" ADD COLUMN IF NOT EXISTS "tokenLast4" TEXT;
