"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

interface StepDef {
  order: number;
  action: string;
  target?: string;
  value?: string;
  assertion?: string;
}

interface StepLogEntry {
  order: number;
  action: string;
  passed: boolean;
  error?: string;
}

interface TestCaseDetail {
  id: string;
  title: string;
  priority: string;
  status: string;
  testType: string | null;
  platform: string | null;
  source: string;
  structuredPlan: { version: number; steps: StepDef[] } | null;
  project: { id: string; name: string };
  latestExecution: {
    id: string;
    status: string;
    stepLog: StepLogEntry[] | null;
    createdAt: string;
  } | null;
}

export default function TestCaseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tc, setTc] = useState<TestCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/test-cases/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setTc)
      .catch(() => setTc(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!tc) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects">← Back to Projects</Link>
        </Button>
        <p className="py-12 text-center text-muted-foreground">Test case not found.</p>
      </div>
    );
  }

  const steps = tc.structuredPlan?.steps ?? [];
  const stepLogMap = new Map<number, StepLogEntry>();
  if (tc.latestExecution?.stepLog) {
    tc.latestExecution.stepLog.forEach((s) => stepLogMap.set(s.order, s));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={tc.title}
        subtitle={tc.project?.name ? `Project: ${tc.project.name}` : undefined}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${tc.project?.id}`}>← Back to project</Link>
          </Button>
        }
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What this test runs</CardTitle>
            <CardDescription>Test type and platform (read-only)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Test type</span>
              <Badge variant="default">
                {tc.testType ?? "—"}
              </Badge>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Platform</span>
              <p className="mt-1 text-sm font-medium text-foreground">
                {tc.platform ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge
                variant={
                  tc.status === "PASSED"
                    ? "success"
                    : tc.status === "FAILED"
                      ? "destructive"
                      : tc.status === "READY" || tc.status === "TESTING"
                        ? "running"
                        : "default"
                }
              >
                {tc.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Priority</span>
              <span className="text-foreground">{tc.priority}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Source</span>
              <span className="text-foreground">{tc.source}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest run</CardTitle>
          </CardHeader>
          <CardContent>
            {tc.latestExecution ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Result</span>
                  <Badge
                    variant={
                      tc.latestExecution.status === "PASSED"
                        ? "success"
                        : tc.latestExecution.status === "FAILED"
                          ? "destructive"
                          : tc.latestExecution.status === "IGNORE"
                            ? "secondary"
                            : "default"
                    }
                  >
                    {tc.latestExecution.status}
                  </Badge>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link href={`/executions/${tc.latestExecution.id}`}>View execution</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not run yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execute steps</CardTitle>
          <CardDescription>
            Steps from the test plan. Status from latest run (if any).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {steps.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No steps defined. Add a structured plan to see steps here.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {steps.map((step) => {
                const log = stepLogMap.get(step.order);
                return (
                  <li
                    key={step.order}
                    className="flex items-start gap-4 p-4 hover:bg-elevated/30"
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          log === undefined
                            ? "default"
                            : log.passed
                              ? "success"
                              : "destructive"
                        }
                      >
                        {step.order}
                      </Badge>
                      {log !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {log.passed ? "Passed" : "Failed"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <p className="font-medium text-foreground">{step.action}</p>
                      {step.target && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Target:</span> {step.target}
                        </p>
                      )}
                      {step.value != null && step.value !== "" && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Value:</span> {step.value}
                        </p>
                      )}
                      {step.assertion && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Assert:</span> {step.assertion}
                        </p>
                      )}
                      {log && !log.passed && log.error && (
                        <p className="text-destructive">{log.error}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
