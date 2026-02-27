/**
 * GET /api/projects/[id]/export-test-cases
 * Export test cases for the project as Excel (.xlsx).
 * Excludes test cases linked to a Ticket of type "BUG".
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import ExcelJS from "exceljs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, jiraProjectKey: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const testCases = await prisma.testCase.findMany({
    where: { projectId },
    include: {
      ticket: { select: { id: true, title: true, type: true, externalId: true } },
      application: { select: { id: true, name: true, code: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const filtered = testCases.filter((tc) => {
    if (!tc.ticketId) return true;
    return tc.ticket?.type !== "BUG";
  });

  if (filtered.length === 0) {
    return NextResponse.json(
      { error: "No test cases available for export" },
      { status: 404 }
    );
  }

  const projectCode =
    (project.jiraProjectKey && project.jiraProjectKey.trim()) ||
    project.name.replace(/\W+/g, "_").replace(/_+/g, "_").slice(0, 50) ||
    project.id;
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${projectCode}_TestCases_${yyyymmdd}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Test Cases", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const HEADER_BG = "FF1F4E78";
  const ROW_ALT_FILL = "FFF2F2F2";
  const thinBorder = {
    top: { style: "thin" as const },
    left: { style: "thin" as const },
    bottom: { style: "thin" as const },
    right: { style: "thin" as const },
  };

  sheet.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Title", key: "title", width: 30 },
    { header: "Status", key: "status", width: 15 },
    { header: "Ticket", key: "ticket", width: 35 },
    { header: "Application", key: "application", width: 20 },
    { header: "Test Type", key: "testType", width: 12 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Steps", key: "steps", width: 50 },
    { header: "Expected Result", key: "expectedResult", width: 40 },
    { header: "Category", key: "category", width: 15 },
    { header: "Data Condition", key: "dataCondition", width: 20 },
    { header: "Setup Hint", key: "setupHint", width: 25 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  for (let c = 1; c <= 12; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  }

  sheet.autoFilter = "A1:L1";

  filtered.forEach((tc, index) => {
    const ticketTitle = tc.ticket?.title ?? tc.ticket?.externalId ?? "—";
    const applicationName = tc.application?.name ?? tc.application?.code ?? "—";
    const testType = tc.testType ?? "—";
    const priority = tc.priority ?? "—";
    const status = tc.status ?? "—";
    const stepsText =
      Array.isArray(tc.testSteps) && tc.testSteps.length > 0
        ? tc.testSteps.map((s, i) => `${i + 1}. ${String(s)}`).join("\n")
        : "—";
    const expectedResult = tc.expectedResult?.trim() || "—";
    const category = tc.category ?? "—";
    const dataCondition = tc.data_condition ?? "—";
    const setupHint = tc.setup_hint ?? "—";

    const row = sheet.addRow({
      no: index + 1,
      title: tc.title,
      status,
      ticket: ticketTitle,
      application: applicationName,
      testType,
      priority,
      steps: stepsText,
      expectedResult,
      category,
      dataCondition,
      setupHint,
    });
    const stepsLines = stepsText.split(/\n/).length;
    const expectedLines = expectedResult.split(/\n/).length;
    const lineCount = Math.max(stepsLines, expectedLines, 1);
    const pointsPerLine = 16;
    row.height = Math.max(18, Math.ceil(lineCount * pointsPerLine));
    const altFill = index % 2 === 1 ? { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: ROW_ALT_FILL } } : undefined;
    const centerColumns = [1, 3, 6, 7];
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      cell.font = { size: 11 };
      cell.alignment = {
        horizontal: centerColumns.includes(c) ? "center" : "left",
        vertical: "top",
        wrapText: c === 8 || c === 9,
      };
      cell.border = thinBorder;
      if (altFill) cell.fill = altFill;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
