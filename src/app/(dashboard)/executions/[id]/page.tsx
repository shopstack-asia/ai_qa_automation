"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { VideoPreview } from "@/components/executions/video-preview";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ExecutionDetail {
  id: string;
  status: string;
  duration: number | null;
  videoUrl: string | null;
  screenshotUrls: string[] | null;
  stepLog: Array<{
    order: number;
    action: string;
    passed: boolean;
    error?: string;
    screenshotUrl?: string;
  }> | null;
  resultSummary: string | null;
  errorMessage: string | null;
  executionMetadata?: {
    base_url?: string;
    test_data?: Record<string, string | undefined>;
  } | null;
  readableSteps?: string[] | null;
  agentExecution?: unknown;
  createdAt: string;
  testCase: { id: string; title: string };
  environment: { name: string };
  project: { name: string };
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [exec, setExec] = useState<ExecutionDetail | null>(null);
  const [showRawExecution, setShowRawExecution] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/executions/${id}`)
      .then((r) => r.json())
      .then(setExec)
      .catch(() => setExec(null));
  }, [id]);

  if (!exec) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={exec.testCase?.title ?? "Execution"}
        subtitle={`${exec.project?.name} · ${exec.environment?.name}`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/executions">← Back to Executions</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge
                variant={
                  exec.status === "PASSED"
                    ? "success"
                    : exec.status === "FAILED"
                      ? "destructive"
                      : exec.status === "IGNORE"
                        ? "queued"
                        : "default"
                }
              >
                {exec.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duration</span>
              <span className="text-foreground">
                {exec.duration != null ? `${exec.duration}ms` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Project</span>
              <span className="text-foreground">{exec.project?.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Environment</span>
              <span className="text-foreground">
                {exec.environment?.name ?? "—"}
              </span>
            </div>
            {exec.resultSummary && (
              <div className="pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground">Result</span>
                <p className="mt-1 text-foreground">{exec.resultSummary}</p>
              </div>
            )}
            {exec.errorMessage && (
              <p className="text-sm text-destructive">{exec.errorMessage}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <VideoPreview
              src={exec.videoUrl}
              className="w-full aspect-video rounded-lg"
            />
          </CardContent>
        </Card>
      </div>

      {exec.executionMetadata && (
        <Card>
          <CardHeader>
            <CardTitle>Test data used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {exec.executionMetadata.base_url && (
              <div>
                <span className="text-sm text-muted-foreground">Base URL</span>
                <p className="mt-0.5 text-foreground font-mono text-sm break-all">{exec.executionMetadata.base_url}</p>
              </div>
            )}
            {exec.executionMetadata.test_data && Object.keys(exec.executionMetadata.test_data).length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Test data</span>
                <dl className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                  {Object.entries(exec.executionMetadata.test_data).map(([key, value]) =>
                    value != null && value !== "" ? (
                      <div key={key} className="rounded border border-border bg-muted/20 px-3 py-2">
                        <dt className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</dt>
                        <dd className="mt-0.5 text-sm font-mono">{value}</dd>
                      </div>
                    ) : null
                  )}
                </dl>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {exec.readableSteps && exec.readableSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Readable steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-foreground">
              {exec.readableSteps.map((line, i) => (
                <li key={i} className="pl-1">{line}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {exec.stepLog && exec.stepLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Step log</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {exec.stepLog.map((step) => (
                <li
                  key={step.order}
                  className="flex items-start gap-3 rounded-lg border border-border bg-elevated/50 p-3 text-sm"
                >
                  <Badge
                    variant={step.passed ? "success" : "destructive"}
                    className="shrink-0"
                  >
                    {step.order}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{step.action}</span>
                    {step.error && (
                      <p className="mt-1 text-destructive text-xs break-words">{step.error}</p>
                    )}
                    {"screenshotUrl" in step && step.screenshotUrl && (
                      <div className="mt-2 space-y-1">
                        <a
                          href={step.screenshotUrl as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          View image
                        </a>
                        <img
                          src={step.screenshotUrl as string}
                          alt={`Step ${step.order}`}
                          className="rounded border border-border max-h-48 object-contain block"
                        />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {exec.agentExecution != null && (
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowRawExecution((v) => !v)}
              className="flex items-center gap-2 text-left font-medium hover:text-foreground"
            >
              {showRawExecution ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Raw agent execution (advanced)
            </button>
          </CardHeader>
          {showRawExecution && (
            <CardContent>
              <pre className="max-h-[400px] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                {JSON.stringify(exec.agentExecution, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
