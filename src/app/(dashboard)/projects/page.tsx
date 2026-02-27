"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DonutChart } from "@/components/ui/donut-chart";
import { Role } from "@prisma/client";

interface ProjectItem {
  id: string;
  name: string;
  jiraProjectKey?: string | null;
  _count: { testCases: number; executions: number };
  ticketsCount: number;
  passedCount: number;
  failedCount: number;
  completedCount: number;
  inProgressCount: number;
  testCasesWithExecutionsCount?: number;
}

export default function ProjectsPage() {
  const [list, setList] = useState<ProjectItem[]>([]);
  const [userRole, setUserRole] = useState<Role | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
    
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) {
          setUserRole(data.role as Role);
        }
      })
      .catch(() => {
        // Ignore errors
      });
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        subtitle="Manage projects and their test cases"
        actions={
          userRole !== "qa" ? (
            <Button asChild>
              <Link href="/projects/new">Create project</Link>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>All projects</CardTitle>
          <CardDescription>
            Projects with tickets, test cases, and execution overview
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No projects yet
              </p>
            ) : (
              list.map((p) => {
                const tc = p._count?.testCases ?? 0;
                const totalExec = p._count?.executions ?? 0;
                const passed = p.passedCount ?? 0;
                const failed = p.failedCount ?? 0;
                const completed = p.completedCount ?? passed + failed;
                const inProgress = p.inProgressCount ?? 0;
                const testCasesWithExecutions = p.testCasesWithExecutionsCount ?? 0;
                const notStarted = Math.max(0, tc - testCasesWithExecutions);
                // Progress % = (test cases with at least one execution) / (total test cases) * 100
                const progressPct = tc ? Math.min(100, Math.round((testCasesWithExecutions / tc) * 100)) : 0;
                const passedPct = totalExec ? Math.round((passed / totalExec) * 100) : 0;
                const failedPct = totalExec ? Math.round((failed / totalExec) * 100) : 0;

                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-4 rounded-lg border border-border bg-elevated/50 p-5 transition-colors hover:bg-elevated sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/projects/${p.id}`}
                        className="text-xl font-semibold text-foreground hover:text-accent hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.jiraProjectKey && (
                        <div className="mt-1 text-sm font-mono text-muted-foreground">
                          {p.jiraProjectKey}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>Tickets: {p.ticketsCount ?? 0}</span>
                        <span>Test cases: {tc}</span>
                        <span>Executions: {totalExec}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-6 sm:gap-8">
                      <div className="flex flex-col rounded-xl border border-border bg-elevated/80 overflow-hidden min-w-[9rem]">
                        <div className="grid grid-cols-2 divide-x divide-border">
                          <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                            <div className="text-3xl font-bold tabular-nums text-success">{completed}</div>
                            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Done</div>
                          </div>
                          <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                            <div className="text-3xl font-bold tabular-nums text-warning">{inProgress}</div>
                            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">In progress</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-center justify-center border-t border-border px-4 py-3 text-center">
                          <div className="text-2xl font-bold tabular-nums text-accent">{tc}</div>
                          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <DonutChart
                          size={72}
                          centerLabel={`${progressPct}%`}
                          data={[
                            {
                              name: "Done",
                              value: completed,
                              color: "#22c55e",
                            },
                            {
                              name: "In progress",
                              value: inProgress,
                              color: "#f59e0b",
                            },
                            {
                              name: "Not started",
                              value: notStarted,
                              color: "rgba(255,255,255,0.08)",
                            },
                          ]}
                        />
                        <span className="text-xs text-muted-foreground">
                          Progress %
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <DonutChart
                          size={72}
                          centerLabel={`${passedPct}%`}
                          data={[
                            {
                              name: "Passed",
                              value: passed,
                              color: "#22c55e",
                            },
                            {
                              name: "Other",
                              value: totalExec - passed,
                              color: "rgba(255,255,255,0.08)",
                            },
                          ]}
                        />
                        <span className="text-xs text-muted-foreground">
                          Passed %
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <DonutChart
                          size={72}
                          centerLabel={`${failedPct}%`}
                          data={[
                            {
                              name: "Failed",
                              value: failed,
                              color: "#ef4444",
                            },
                            {
                              name: "Other",
                              value: totalExec - failed,
                              color: "rgba(255,255,255,0.08)",
                            },
                          ]}
                        />
                        <span className="text-xs text-muted-foreground">
                          Failed %
                        </span>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" className="shrink-0 sm:self-center" asChild>
                      <Link href={`/projects/${p.id}`}>View</Link>
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
