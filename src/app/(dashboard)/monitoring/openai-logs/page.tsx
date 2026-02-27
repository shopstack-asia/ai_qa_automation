"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from "@/components/ui/sheet";

interface OpenAILogRow {
  id: string;
  source: string;
  model: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  "generate-test-case-from-ticket": "Generate test case from ticket",
  "generate-plan": "Generate plan",
  "step-resolver": "Step resolver",
  "data-generation": "Data generation",
};

function extractErrorFromResponse(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "_error" in payload && typeof (payload as { _error?: unknown })._error === "string") {
    return (payload as { _error: string })._error;
  }
  if (payload && typeof payload === "object" && "error" in payload && typeof (payload as { error?: unknown }).error === "string") {
    return (payload as { error: string }).error;
  }
  return null;
}

export default function OpenAILogsPage() {
  const [logs, setLogs] = useState<OpenAILogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLog, setDetailLog] = useState<OpenAILogRow | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (sourceFilter) params.set("source", sourceFilter);
    fetch(`/api/openai-logs?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, totalPages: 1 }))
      .then((res) => {
        setLogs(Array.isArray(res.data) ? res.data : []);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [page, limit, sourceFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="OpenAI Logs"
        subtitle="Request and response logs for OpenAI API calls"
      />

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardDescription>
            Each row is one OpenAI call. Token counts and estimated cost (USD) are shown. Use &quot;View&quot; to see request and response payloads.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <label className="text-sm text-muted-foreground">Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All</option>
              <option value="generate-test-case-from-ticket">Generate test case from ticket</option>
              <option value="generate-plan">Generate plan</option>
              <option value="step-resolver">Step resolver</option>
              <option value="data-generation">Data generation</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No logs yet</p>
          ) : (
            <>
              {(() => {
                const pageTotalTokens = logs.reduce((s, l) => s + (l.totalTokens ?? 0), 0);
                const pageTotalCost = logs.reduce((s, l) => s + (l.estimatedCostUsd ?? 0), 0);
                return (
                  (pageTotalTokens > 0 || pageTotalCost > 0) && (
                    <p className="mb-4 text-sm text-muted-foreground">
                      This page: {pageTotalTokens.toLocaleString()} tokens total · Est. cost ${pageTotalCost.toFixed(4)} USD
                    </p>
                  )
                );
              })()}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                        {log.createdAt
                          ? new Date(log.createdAt).toLocaleString(undefined, {
                              dateStyle: "short",
                              timeStyle: "medium",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {SOURCE_LABELS[log.source] ?? log.source}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{log.model ?? "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {log.totalTokens != null
                          ? log.totalTokens.toLocaleString()
                          : log.promptTokens != null || log.completionTokens != null
                            ? `${(log.promptTokens ?? 0).toLocaleString()} / ${(log.completionTokens ?? 0).toLocaleString()}`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {log.estimatedCostUsd != null
                          ? `$${log.estimatedCostUsd.toFixed(6)}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDetailLog(log)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {page} of {totalPages} ({total} total)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!detailLog} onOpenChange={(open) => !open && setDetailLog(null)}>
        <SheetContent side="right" className="flex w-full max-w-2xl flex-col sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Request &amp; Response</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex-1 space-y-4 overflow-y-auto">
            {detailLog && (
              <>
                {extractErrorFromResponse(detailLog.responsePayload) && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <h4 className="mb-1 font-medium">Error</h4>
                    <p>{extractErrorFromResponse(detailLog.responsePayload)}</p>
                  </div>
                )}
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">Request</h4>
                  <pre className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                    {JSON.stringify(detailLog.requestPayload, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">Response (raw from AI)</h4>
                  <pre className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                    {JSON.stringify(detailLog.responsePayload, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
