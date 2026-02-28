"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getExecutionDisplayStatus, executionStatusBadgeVariant } from "@/lib/execution-status";

interface S3LogRow {
  id: string;
  status: string;
  execution_status?: string;
  videoUrl: string | null;
  screenshotCount: number;
  finishedAt: string | null;
  duration: number | null;
  testCaseId: string;
  testCaseTitle: string | null;
  projectId: string | null;
  projectName: string | null;
}

export default function S3LogsPage() {
  const [logs, setLogs] = useState<S3LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    fetch(`/api/s3-logs?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, totalPages: 1 }))
      .then((res) => {
        setLogs(Array.isArray(res.data) ? res.data : []);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [page, limit]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="S3 Logs"
        subtitle="Executions with S3 artifacts (video and screenshots)"
      />

      <Card>
        <CardHeader>
          <CardTitle>Artifact log</CardTitle>
          <CardDescription>
            Executions that uploaded video or screenshots to S3. Link to execution detail to view artifacts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No S3 artifacts yet. Run executions to generate videos and screenshots.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Finished</TableHead>
                    <TableHead>Execution</TableHead>
                    <TableHead>Test case</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Video</TableHead>
                    <TableHead className="text-center">Screenshots</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                        {row.finishedAt
                          ? new Date(row.finishedAt).toLocaleString(undefined, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.id.slice(0, 8)}…</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.testCaseTitle ?? ""}>
                        {row.testCaseTitle ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.projectName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={executionStatusBadgeVariant(
                            getExecutionDisplayStatus(row.status, row.execution_status)
                          )}
                        >
                          {getExecutionDisplayStatus(row.status, row.execution_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm">
                        {row.videoUrl ? "Yes" : "—"}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm tabular-nums">
                        {row.screenshotCount > 0 ? row.screenshotCount : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                        {row.duration != null ? `${row.duration}ms` : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/executions/${row.id}`}>View</Link>
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
                  <div className="flex items-center gap-2">
                    <select
                      value={limit}
                      onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
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
    </div>
  );
}
