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

interface N8nLogRow {
  id: string;
  event: string;
  url: string;
  requestBody: unknown;
  responseStatus: number | null;
  responseBody: unknown;
  errorMessage: string | null;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  start_testing: "Start Testing",
  test_passed: "Test Passed",
  test_failed: "Test Failed",
};

export default function N8nLogsPage() {
  const [logs, setLogs] = useState<N8nLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);
  const [eventFilter, setEventFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLog, setDetailLog] = useState<N8nLogRow | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (eventFilter.trim()) params.set("event", eventFilter.trim());
    fetch(`/api/monitoring/n8n-logs?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, totalPages: 1 }))
      .then((res) => {
        setLogs(Array.isArray(res.data) ? res.data : []);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [page, limit, eventFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="N8N Webhook Logs"
        subtitle="Request and response logs when this platform calls N8N webhooks (Start Testing, Test Passed, Test Failed)"
      />

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardDescription>
            Each row is one outgoing webhook call to N8N. Use &quot;View&quot; to see request and response bodies.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <label className="text-sm text-muted-foreground">Event</label>
            <select
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All</option>
              <option value="start_testing">Start Testing</option>
              <option value="test_passed">Test Passed</option>
              <option value="test_failed">Test Failed</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No N8N webhook logs yet</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="max-w-[280px] truncate">URL</TableHead>
                    <TableHead className="text-right">Status</TableHead>
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
                        <span className="font-medium">
                          {EVENT_LABELS[log.event] ?? log.event}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-mono text-sm" title={log.url}>
                        {log.url}
                      </TableCell>
                      <TableCell className="text-right">
                        {log.errorMessage ? (
                          <span className="text-destructive" title={log.errorMessage}>
                            Error
                          </span>
                        ) : log.responseStatus != null ? (
                          <span
                            className={
                              log.responseStatus >= 400
                                ? "text-destructive"
                                : log.responseStatus >= 300
                                  ? "text-amber-600"
                                  : "text-muted-foreground"
                            }
                          >
                            {log.responseStatus}
                          </span>
                        ) : (
                          "—"
                        )}
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
            <SheetTitle>N8N Request &amp; Response</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex-1 space-y-4 overflow-y-auto">
            {detailLog && (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Event</span>{" "}
                    <span className="font-medium">
                      {EVENT_LABELS[detailLog.event] ?? detailLog.event}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>{" "}
                    <span className="font-medium">
                      {detailLog.errorMessage
                        ? "Error"
                        : detailLog.responseStatus != null
                          ? String(detailLog.responseStatus)
                          : "—"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">URL</span>{" "}
                    <span className="font-mono text-xs break-all">{detailLog.url}</span>
                  </div>
                  {detailLog.errorMessage && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Error</span>{" "}
                      <span className="text-destructive text-xs">{detailLog.errorMessage}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Time</span>{" "}
                    {detailLog.createdAt
                      ? new Date(detailLog.createdAt).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">Request body</h4>
                  <pre className="max-h-[30vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                    {detailLog.requestBody != null
                      ? JSON.stringify(detailLog.requestBody, null, 2)
                      : "(none)"}
                  </pre>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">Response body</h4>
                  <pre className="max-h-[30vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                    {detailLog.responseBody != null
                      ? JSON.stringify(detailLog.responseBody, null, 2)
                      : detailLog.errorMessage
                        ? "(request failed before response)"
                        : "(none)"}
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
