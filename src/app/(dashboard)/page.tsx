"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getExecutionDisplayStatus, executionStatusBadgeVariant } from "@/lib/execution-status";

interface DashboardStats {
  totalProjects: number;
  totalTestCases: number;
  totalExecutions: number;
  executionRate: number;
  passed: number;
  failed: number;
  /** Classified failure breakdown (from execution_status in metadata). */
  failedBreakdown?: { business: number; unverifiedData: number; selector: number; other: number };
  recentExecutions: Array<{
    id: string;
    status: string;
    executionMetadata?: { execution_status?: string } | null;
    duration: number | null;
    createdAt: string;
    testCase: { title: string };
    environment: { name: string };
  }>;
  trend: Array<{ date: string; passed: number; failed: number }>;
  health: { db: string; redis: string };
}

const EMPTY_STATS: DashboardStats = {
  totalProjects: 0,
  totalTestCases: 0,
  totalExecutions: 0,
  executionRate: 0,
  passed: 0,
  failed: 0,
  recentExecutions: [],
  trend: [{ date: "—", passed: 0, failed: 0 }],
  health: { db: "", redis: "" },
};

/** Uses classified execution_status when available (from executionMetadata). */
function statusVariant(
  status: string,
  executionStatus?: string | null
): "success" | "destructive" | "warning" | "running" | "queued" | "default" {
  return executionStatusBadgeVariant(
    getExecutionDisplayStatus(status, executionStatus)
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const defaultHealth = { db: "" as const, redis: "" as const };

    Promise.allSettled([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/executions?limit=10").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()).catch(() => defaultHealth),
    ]).then(([projectsResult, executionsResult, healthResult]) => {
      const projects =
        projectsResult.status === "fulfilled" && Array.isArray(projectsResult.value)
          ? projectsResult.value
          : [];
      const executions =
        executionsResult.status === "fulfilled" && Array.isArray(executionsResult.value)
          ? executionsResult.value
          : [];
      const health =
        healthResult.status === "fulfilled" && healthResult.value && typeof healthResult.value === "object" && "db" in healthResult.value
          ? healthResult.value as { db: string; redis: string }
          : defaultHealth;

      const totalProjects = projects.length;
      const totalTestCases = projects.reduce(
        (s: number, p: { _count?: { testCases: number } }) => s + (p._count?.testCases ?? 0),
        0
      );
      const totalExecutions = executions.length;
      const passed = executions.filter((e: { status: string }) => e.status === "PASSED").length;
      const failed = executions.filter((e: { status: string }) => e.status === "FAILED").length;
      const failedExecutions = executions.filter(
        (e: { status: string; executionMetadata?: { execution_status?: string } | null }) =>
          e.status === "FAILED"
      ) as Array<{ executionMetadata?: { execution_status?: string } | null }>;
      const failedBreakdown = {
        business: failedExecutions.filter((e) => e.executionMetadata?.execution_status === "FAILED_BUSINESS").length,
        unverifiedData: failedExecutions.filter((e) => e.executionMetadata?.execution_status === "FAILED_UNVERIFIED_DATA").length,
        selector: failedExecutions.filter((e) => e.executionMetadata?.execution_status === "FAILED_SELECTOR").length,
        other: failedExecutions.filter(
          (e) =>
            !e.executionMetadata?.execution_status ||
            e.executionMetadata.execution_status === "FAILED"
        ).length,
      };
      const executionRate =
        totalTestCases > 0 ? Math.round((totalExecutions / totalTestCases) * 100) : 0;

      const trend = (executions as Array<{ createdAt: string; status: string }>)
        .slice(0, 7)
        .reverse()
        .reduce(
          (acc: { date: string; passed: number; failed: number }[], e) => {
            const d = e.createdAt.slice(0, 10);
            const existing = acc.find((x) => x.date === d);
            if (existing) {
              if (e.status === "PASSED") existing.passed += 1;
              else existing.failed += 1;
            } else {
              acc.push({
                date: d,
                passed: e.status === "PASSED" ? 1 : 0,
                failed: e.status === "FAILED" ? 1 : 0,
              });
            }
            return acc;
          },
          []
        );

      setStats({
        totalProjects,
        totalTestCases,
        totalExecutions,
        executionRate,
        passed,
        failed,
        failedBreakdown: failed > 0 ? failedBreakdown : undefined,
        recentExecutions: executions,
        trend: trend.length ? trend : [{ date: "—", passed: 0, failed: 0 }],
        health,
      });
    }).finally(() => setLoading(false));
  }, []);

  const kpis = [
    { label: "Projects", value: stats.totalProjects },
    { label: "Test Cases", value: stats.totalTestCases },
    { label: "Execution Rate", value: `${stats.executionRate}%` },
    { label: "Passed", value: stats.passed, highlight: "success" as const },
    {
      label: "Failed",
      value: stats.failed,
      highlight: "destructive" as const,
      subtitle:
        stats.failedBreakdown && stats.failed > 0
          ? `Business: ${stats.failedBreakdown.business} · Unverified data: ${stats.failedBreakdown.unverifiedData} · Selector: ${stats.failedBreakdown.selector} · Other: ${stats.failedBreakdown.other}`
          : undefined,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of projects, test cases, and execution results"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="p-6">
            <p className="text-sm font-medium text-muted-foreground">
              {k.label}
            </p>
            <p
              className={
                k.highlight === "success"
                  ? "mt-2 text-2xl font-semibold text-success"
                  : k.highlight === "destructive"
                    ? "mt-2 text-2xl font-semibold text-destructive"
                    : "mt-2 text-2xl font-semibold text-foreground"
              }
            >
              {loading ? (
                <span className="inline-block min-w-[2rem] animate-pulse text-muted-foreground">
                  —
                </span>
              ) : (
                k.value
              )}
            </p>
            {"subtitle" in k && k.subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{k.subtitle}</p>
            )}
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Execution Trend</CardTitle>
            <CardDescription>Passed vs failed by date</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[260px] items-center justify-center rounded-lg bg-elevated/30 text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              <div className="rounded-lg bg-elevated/30">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={stats.trend}
                    margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                    />
                    <XAxis
                      dataKey="date"
                      stroke="rgba(148,163,184,0.8)"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="rgba(148,163,184,0.8)"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "0.75rem",
                      }}
                      labelStyle={{ color: "#f8fafc" }}
                      cursor={{ fill: "rgba(30,41,59,0.4)" }}
                    />
                  <Bar
                    dataKey="passed"
                    fill="#22c55e"
                    name="Passed"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="failed"
                    fill="#ef4444"
                    name="Failed"
                    radius={[4, 4, 0, 0]}
                  />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Database</span>
              <span
                className={
                  loading
                    ? "text-sm text-muted-foreground"
                    : stats.health?.db === "up"
                      ? "text-sm font-medium text-success"
                      : "text-sm font-medium text-destructive"
                }
              >
                {loading ? "—" : stats.health?.db === "up" ? "Up" : "Down"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Redis</span>
              <span
                className={
                  loading
                    ? "text-sm text-muted-foreground"
                    : stats.health?.redis === "up"
                      ? "text-sm font-medium text-success"
                      : "text-sm font-medium text-destructive"
                }
              >
                {loading ? "—" : stats.health?.redis === "up" ? "Up" : "Down"}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
          <CardDescription>Latest test run results</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test Case</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : stats.recentExecutions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    No executions yet
                  </TableCell>
                </TableRow>
              ) : (
                stats.recentExecutions.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link
                        href={`/executions/${e.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {e.testCase?.title ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.environment?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusVariant(
                          e.status,
                          e.executionMetadata?.execution_status
                        )}
                      >
                        {getExecutionDisplayStatus(
                          e.status,
                          e.executionMetadata?.execution_status
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {e.duration != null ? `${e.duration}ms` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.createdAt
                        ? new Date(e.createdAt).toLocaleString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
