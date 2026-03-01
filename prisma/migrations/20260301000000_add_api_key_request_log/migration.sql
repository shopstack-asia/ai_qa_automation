-- CreateTable: API key request/response logs (N8N / external integration calls)
CREATE TABLE "ApiKeyRequestLog" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestBody" JSONB,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiKeyRequestLog_apiKeyId_idx" ON "ApiKeyRequestLog"("apiKeyId");
CREATE INDEX "ApiKeyRequestLog_createdAt_idx" ON "ApiKeyRequestLog"("createdAt");
CREATE INDEX "ApiKeyRequestLog_path_idx" ON "ApiKeyRequestLog"("path");

-- AddForeignKey (onDelete SetNull: when API key is deleted, log rows keep apiKeyId as null)
ALTER TABLE "ApiKeyRequestLog" ADD CONSTRAINT "ApiKeyRequestLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
