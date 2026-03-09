/**
 * POST /api/ai/generate-test-case-from-ticket
 * Body: { ticketId: string }
 * Two-step AI: scenario planner then per-scenario generation. Prompts from Config. Creates TestCase(s) with status READY, source AI.
 * Returns { testCaseIds }; optional errors[] on partial failure.
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
