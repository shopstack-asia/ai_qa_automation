/**
 * POST /api/ai/generate-test-case-from-ticket
 * Body: { ticketId: string }
 * Fetches prompts from Config, calls OpenAI with placeholder-injected user prompt, creates TestCase(s) with status ready, source AI.
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { aiGenerateTestCaseFromTicketSchema } from "@/lib/validations/schemas";
import { generateTestCaseFromTicket } from "@/lib/ai/generate-test-case-from-ticket";

export const POST = withApiKeyLogging(PERMISSIONS.CREATE_TEST_CASES, async (req, auth) => {
  const parsed = aiGenerateTestCaseFromTicketSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await generateTestCaseFromTicket(parsed.data.ticketId, {
      createdById: auth.userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
