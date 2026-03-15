-- AlterTable: Execution.testCaseId FK: Restrict -> Cascade so that deleting a TestCase also deletes its Executions.
ALTER TABLE "Execution" DROP CONSTRAINT IF EXISTS "Execution_testCaseId_fkey";
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
