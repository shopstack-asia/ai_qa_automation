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
import Link from "next/link";
import { toast } from "sonner";

interface JobRow {
  id: string | undefined;
  ticketId: string | null;
  retryCount: number;
  lastError: string | null;
  timestamp: number | null;
}

interface MonitorData {
  counts: { waiting: number; active: number; delayed: number; completed: number; failed: number };
  jobs: { waiting: JobRow[]; active: JobRow[]; failed: JobRow[] };
}

export default function QueueMonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchMonitor = () => {
    setLoading(true);
    fetch("/api/queue-monitor")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMonitor();
    const t = setInterval(fetchMonitor, 10000);
    return () => clearInterval(t);
  }, []);

  const handleRetry = async (jobId: string) => {
    setActioning(jobId);
    try {
      const res = await fetch("/api/queue-monitor/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Job queued for retry");
        fetchMonitor();
      } else {
        toast.error(json.error ?? "Retry failed");
      }
    } finally {
      setActioning(null);
    }
  };

  const handleRemove = async (jobId: string) => {
    if (!confirm("Remove this failed job from the queue?")) return;
    setActioning(jobId);
    try {
      const res = await fetch("/api/queue-monitor/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Job removed");
        fetchMonitor();
      } else {
        toast.error(json.error ?? "Remove failed");
      }
    } finally {
      setActioning(null);
    }
  };

  const handleClean = async () => {
    if (!confirm("Remove all completed and failed jobs from the queue? Counts will drop to 0.")) return;
    setActioning("clean");
    try {
      const res = await fetch("/api/queue-monitor/clean", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Cleaned: ${json.removed?.completed ?? 0} completed, ${json.removed?.failed ?? 0} failed`);
        setData((d) => (d && json.counts ? { ...d, counts: json.counts, jobs: { ...d.jobs, failed: [] } } : d));
        fetchMonitor();
      } else {
        toast.error(json.error ?? "Clean failed");
      }
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Queue Monitor"
        subtitle="AI test case generation queue (ai-testcase-generation)"
      />

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Queued</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{(data.counts.waiting ?? 0) + (data.counts.delayed ?? 0)}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{data.counts.active ?? 0}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{data.counts.completed ?? 0}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{data.counts.failed ?? 0}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={fetchMonitor} disabled={loading}>
                  {loading ? "…" : "Refresh"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClean}
                  disabled={loading || actioning === "clean"}
                >
                  {actioning === "clean" ? "…" : "Clean completed & failed"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {(data.jobs.waiting?.length > 0 || data.jobs.active?.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Waiting / Active</CardTitle>
                <CardDescription>Jobs in queue or currently processing</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Retry count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...(data.jobs.waiting ?? []), ...(data.jobs.active ?? [])].map((j) => (
                      <TableRow key={j.id ?? j.ticketId ?? ""}>
                        <TableCell className="font-mono text-sm">{j.id ?? "—"}</TableCell>
                        <TableCell>
                          {j.ticketId ? (
                            <Link href="/projects" className="text-accent hover:underline">
                              {j.ticketId}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{j.retryCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {(data.jobs.failed?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Failed jobs</CardTitle>
                <CardDescription>Retry or remove failed jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Last error</TableHead>
                      <TableHead className="w-[180px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.jobs.failed.map((j) => (
                      <TableRow key={j.id ?? j.ticketId ?? ""}>
                        <TableCell className="font-mono text-sm">{j.id ?? "—"}</TableCell>
                        <TableCell>
                          {j.ticketId ? (
                            <Link href="/projects" className="text-accent hover:underline">
                              {j.ticketId}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{j.retryCount}</TableCell>
                        <TableCell className="max-w-md truncate text-muted-foreground" title={j.lastError ?? ""}>
                          {j.lastError ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!!actioning}
                              onClick={() => j.id && handleRetry(j.id)}
                            >
                              {actioning === j.id ? "…" : "Retry"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!!actioning}
                              onClick={() => j.id && handleRemove(j.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {!data.jobs.waiting?.length && !data.jobs.active?.length && !data.jobs.failed?.length && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No waiting, active, or failed jobs to show.
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Could not load queue. Ensure Redis is running and the worker is configured.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
