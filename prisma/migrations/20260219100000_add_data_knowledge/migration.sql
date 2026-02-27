-- CreateTable
CREATE TABLE "DataKnowledge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "role" TEXT,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataKnowledge_projectId_key_key" ON "DataKnowledge"("projectId", "key");

-- CreateIndex
CREATE INDEX "DataKnowledge_projectId_idx" ON "DataKnowledge"("projectId");

-- AddForeignKey
ALTER TABLE "DataKnowledge" ADD CONSTRAINT "DataKnowledge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
