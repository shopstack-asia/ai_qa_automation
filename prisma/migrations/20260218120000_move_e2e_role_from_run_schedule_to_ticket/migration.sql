-- Ensure Ticket has e2e_credential_role (if old migration only added to TestRun/Schedule)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "e2e_credential_role" TEXT;

-- Remove e2e_credential_role from TestRun and Schedule (role is on Ticket only)
ALTER TABLE "TestRun" DROP COLUMN IF EXISTS "e2e_credential_role";
ALTER TABLE "Schedule" DROP COLUMN IF EXISTS "e2e_credential_role";
