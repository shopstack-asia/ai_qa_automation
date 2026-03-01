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

interface ApiRequestLogRow {
  id: string;
  apiKeyId: string | null;
  apiKey: { name: string } | null;
  tokenLast4: string | null;
  method: string;
  path: string;
  requestBody: unknown;
  responseStatus: number;
  responseBody: unknown;
  createdAt: string;
}

export default function ApiRequestLogsPage() {
  const [logs, setLogs] = useState<ApiRequestLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);
  const [pathFilter, setPathFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLog, setDetailLog] = useState<ApiRequestLogRow | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (pathFilter.trim()) params.set("path", pathFilter.trim());
    fetch(`/api/monitoring/api-request-logs?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, totalPages: 1 }))
      .then((res) => {
        setLogs(Array.isArray(res.data) ? res.data : []);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [page, limit, pathFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Request Log"
        subtitle="Request and response logs for API calls using API key (N8N / external integration)"
      />

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardDescription>
            Each row is one API request authenticated with an API key. Use &quot;View&quot; to see request and response bodies.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <label className="text-sm text-muted-foreground">Path contains</label>
            <input
              type="text"
              value={pathFilter}
              onChange={(e) => {
                setPathFilter(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. /api/tickets"
              className="h-9 w-48 rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No logs yet</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Key Name</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Path</TableHead>
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
                      <TableCell className="text-muted-foreground">
                        {log.apiKey?.name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground text-sm">
                        {log.tokenLast4 ? `••••${log.tokenLast4}` : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{log.method}</span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{log.path}</TableCell>
                      <TableCell className="text-right">
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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Key Name</span>{" "}
                    <span className="font-medium">{detailLog.apiKey?.name ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Token</span>{" "}
                    <span className="font-mono">
                      {detailLog.tokenLast4 ? `••••${detailLog.tokenLast4}` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Method</span>{" "}
                    <span className="font-medium">{detailLog.method}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Path</span>{" "}
                    <span className="font-mono">{detailLog.path}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>{" "}
                    <span className="font-medium">{detailLog.responseStatus}</span>
                  </div>
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
