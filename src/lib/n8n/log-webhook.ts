/**
 * Persist N8N webhook request/response to N8nWebhookLog.
 * Fire-and-forget; errors are logged to console only.
 */

import { prisma } from "@/lib/db/client";

export interface N8nWebhookLogInput {
  event: string;
  url: string;
  requestBody?: unknown;
  responseStatus?: number | null;
  responseBody?: unknown;
  errorMessage?: string | null;
}

export async function saveN8nWebhookLog(input: N8nWebhookLogInput): Promise<void> {
  try {
    const requestBody =
      input.requestBody != null ? (JSON.parse(JSON.stringify(input.requestBody)) as object) : undefined;
    const responseBody =
      input.responseBody != null ? (JSON.parse(JSON.stringify(input.responseBody)) as object) : undefined;
    await prisma.n8nWebhookLog.create({
      data: {
        event: input.event,
        url: input.url,
        requestBody: requestBody ?? undefined,
        responseStatus: input.responseStatus ?? undefined,
        responseBody: responseBody ?? undefined,
        errorMessage: input.errorMessage ?? undefined,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[N8nWebhookLog] save failed:", msg);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  }
}
