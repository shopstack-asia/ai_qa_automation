/**
 * GET /api/users/[id] | PATCH – update user (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().optional(),
  role: z.enum(["admin", "manager", "qa"]).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.MANAGE_USERS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(user);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.MANAGE_USERS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const parsed = updateUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Parameters<typeof prisma.user.update>[0]["data"] = {};
  
  if (parsed.data.email !== undefined) {
    // Check if email already exists (excluding current user)
    const existing = await prisma.user.findFirst({
      where: {
        email: parsed.data.email,
        NOT: { id },
      },
    });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    data.email = parsed.data.email;
  }
  
  if (parsed.data.password !== undefined) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }
  
  if (parsed.data.name !== undefined) {
    data.name = parsed.data.name || null;
  }
  
  if (parsed.data.role !== undefined) {
    data.role = parsed.data.role;
  }
  
  if (parsed.data.isActive !== undefined) {
    data.isActive = parsed.data.isActive;
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  return NextResponse.json(user);
}
