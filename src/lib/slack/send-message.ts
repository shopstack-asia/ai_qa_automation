/**
 * Send messages to Slack via chat.postMessage.
 * Uses config: slack_enabled, slack_bot_token, slack_event_*.
 * Channel is taken from project.slackChannelId (set per project in Project → Edit).
 */

import { getConfig } from "@/lib/config";

export type SlackNotificationEvent =
  | "new_ticket"
  | "generate_test_cases"
  | "testing"
  | "test_passed"
  | "test_failed";

const EVENT_TO_CONFIG_KEY: Record<SlackNotificationEvent, string> = {
  new_ticket: "slack_event_new_ticket",
  generate_test_cases: "slack_event_generate_test_cases",
  testing: "slack_event_testing",
  test_passed: "slack_event_test_passed",
  test_failed: "slack_event_test_failed",
};

export type SendSlackOptions = {
  /** Slack channel ID (e.g. C01234ABCD) or #channel-name. From project.slackChannelId. */
  channelId: string | null | undefined;
  /** Message text (plain text or Slack mrkdwn). */
  text: string;
};

/**
 * Send a Slack notification for the given event if enabled in config and channel is set.
 * No-op if slack_enabled is not true, slack_event_* for this event is false, token missing, or channelId empty.
 */
export async function sendSlackNotification(
  event: SlackNotificationEvent,
  options: SendSlackOptions
): Promise<{ ok: boolean; error?: string }> {
  const { channelId, text } = options;
  const channel = (channelId ?? "").trim();
  if (!channel) {
    return { ok: false, error: "No Slack channel set for project" };
  }

  const config = await getConfig();
  const enabled = (config.slack_enabled ?? "").toLowerCase() === "true";
  if (!enabled) {
    return { ok: false, error: "Slack notifications disabled" };
  }

  const configKey = EVENT_TO_CONFIG_KEY[event];
  const eventEnabled = (config[configKey as keyof typeof config] ?? "").toLowerCase() === "true";
  if (!eventEnabled) {
    return { ok: false, error: `Slack event ${event} is disabled` };
  }

  const token = (config.slack_bot_token ?? "").trim();
  if (!token) {
    return { ok: false, error: "Slack Bot Token not set" };
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: channel.startsWith("#") ? channel.slice(1) : channel,
        text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: (data as { error?: string }).error ?? `HTTP ${res.status}` };
    }
    if (!(data as { ok?: boolean }).ok) {
      return { ok: false, error: (data as { error?: string }).error ?? "Slack API error" };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
