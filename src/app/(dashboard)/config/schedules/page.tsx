"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

interface ScheduleItem {
  id: string;
  name: string;
  cronExpression: string;
  isActive: boolean;
  nextRunAt: string | null;
  project: { id: string; name: string };
  environments: { id: string; name: string }[];
}

export default function ConfigSchedulesPage() {
  const [list, setList] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Schedules"
        subtitle="Cron-based execution schedules (under Config)"
        actions={
          <Button asChild>
            <Link href="/config/schedules/new">Create schedule</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Cron schedules</CardTitle>
          <CardDescription>
            Recurring test runs by project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Environments</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No schedules yet. Create one to run tests on a schedule.
                  </TableCell>
                </TableRow>
              ) : (
                list.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.project?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.environments?.length ? s.environments.map((e: { name: string }) => e.name).join(", ") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.cronExpression}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          s.isActive
                            ? "text-sm text-success"
                            : "text-sm text-muted-foreground"
                        }
                      >
                        {s.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Button variant="ghost" size="sm" asChild>
        <Link href="/config">← Back to Config</Link>
      </Button>
    </div>
  );
}
