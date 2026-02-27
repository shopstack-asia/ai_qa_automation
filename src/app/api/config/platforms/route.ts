/**
 * GET /api/config/platforms – list (any with view). Used for test case platform dropdown.
 * PUT /api/config/platforms – update list (MANAGE_GLOBAL_CONFIG). Body: { platforms: { name: string, testTypes: ("API"|"E2E")[] }[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

const PLATFORM_LIST_KEY = "platform_list";
const DEFAULT_NAMES = ["Commerce Suite", "Magento", "Shopify", "NestJs/ReactJs", "Other"];
const TEST_TYPES = ["API", "E2E"] as const;

type PlatformItem = { name: string; testTypes: string[] };

function normalizePlatforms(raw: unknown): PlatformItem[] {
  if (!Array.isArray(raw)) return DEFAULT_NAMES.map((name) => ({ name, testTypes: [...TEST_TYPES] }));
  const mapped: PlatformItem[] = raw.map((x) => {
    if (typeof x === "string" && x.trim()) return { name: x.trim(), testTypes: [...TEST_TYPES] };
    if (x && typeof x === "object" && "name" in x && typeof (x as PlatformItem).name === "string") {
      const item = x as PlatformItem;
      const testTypes = Array.isArray(item.testTypes)
        ? item.testTypes.filter((t) => t === "API" || t === "E2E")
        : [...TEST_TYPES];
      return { name: String(item.name).trim(), testTypes: testTypes.length ? testTypes : [...TEST_TYPES] };
    }
    return { name: "", testTypes: [...TEST_TYPES] };
  });
  return mapped.filter((x) => x.name.length > 0);
}

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const row = await prisma.systemConfig.findUnique({
    where: { key: PLATFORM_LIST_KEY },
  });
  if (!row?.value) {
    return NextResponse.json({
      platforms: DEFAULT_NAMES.map((name) => ({ name, testTypes: [...TEST_TYPES] })),
    });
  }
  try {
    const parsed = JSON.parse(row.value) as unknown;
    const list = normalizePlatforms(parsed);
    return NextResponse.json({ platforms: list.length ? list : DEFAULT_NAMES.map((name) => ({ name, testTypes: [...TEST_TYPES] })) });
  } catch {
    return NextResponse.json({
      platforms: DEFAULT_NAMES.map((name) => ({ name, testTypes: [...TEST_TYPES] })),
    });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.MANAGE_GLOBAL_CONFIG);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const raw = body?.platforms;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "platforms must be an array" }, { status: 400 });
  }
  const platforms = normalizePlatforms(raw);
  const value = JSON.stringify(platforms);

  await prisma.systemConfig.upsert({
    where: { key: PLATFORM_LIST_KEY },
    create: { key: PLATFORM_LIST_KEY, value, updatedByUserId: auth.userId },
    update: { value, updatedByUserId: auth.userId },
  });

  return NextResponse.json({ platforms });
}
