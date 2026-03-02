-- AlterTable: add Slack Incoming Webhook URL to Project (encrypted at app layer)
ALTER TABLE "Project" ADD COLUMN "slackWebhookUrl" TEXT;
