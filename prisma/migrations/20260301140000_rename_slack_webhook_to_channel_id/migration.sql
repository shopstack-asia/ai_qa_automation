-- Rename Project.slackWebhookUrl to slackChannelId (Slack API uses Bot Token + Channel ID, not webhook URL)
ALTER TABLE "Project" RENAME COLUMN "slackWebhookUrl" TO "slackChannelId";
