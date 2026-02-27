/**
 * POST /api/ai/generate-plan – accept AC, return structured plan (Zod-validated), optionally save.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { aiGeneratePlanSchema } from "@/lib/validations/schemas";
import { generateStructuredPlanFromAC } from "@/lib/ai/generate-plan";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.CREATE_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const parsed = aiGeneratePlanSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const plan = await generateStructuredPlanFromAC(parsed.data.acceptanceCriteria);

  if (parsed.data.projectId) {
    const title =
      parsed.data.acceptanceCriteria.slice(0, 100).replace(/\n/g, " ") + (parsed.data.acceptanceCriteria.length > 100 ? "…" : "");
    const testCase = await prisma.testCase.create({
      data: {
        projectId: parsed.data.projectId,
        title,
        priority: "MEDIUM",
        status: "DRAFT",
        structuredPlan: plan as object,
        source: "AI",
        createdById: auth.userId,
      },
    });
    return NextResponse.json({ plan, testCaseId: testCase.id });
  }

  return NextResponse.json({ plan });
}
