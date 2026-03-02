-- CreateTable: N8N webhook call logs (outgoing requests to N8N)
CREATE TABLE "N8nWebhookLog" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "requestBody" JSONB,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "N8nWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "N8nWebhookLog_createdAt_idx" ON "N8nWebhookLog"("createdAt");
CREATE INDEX "N8nWebhookLog_event_idx" ON "N8nWebhookLog"("event");
