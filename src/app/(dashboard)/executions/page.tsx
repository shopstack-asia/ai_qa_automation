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
import { getExecutionDisplayStatus, executionStatusBadgeVariant } from "@/lib/execution-status";

export default function ExecutionsPage() {
  const [list, setList] = useState<
    Array<{
      id: string;
      status: string;
      executionMetadata?: { execution_status?: string } | null;
      duration: number | null;
      createdAt: string;
      testCase: { title: string };
      environment: { name: string };
      project: { name: string };
    }>
  >([]);

  useEffect(() => {
    fetch("/api/executions?limit=50")
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Executions"
        subtitle="Test run history and results"
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent executions</CardTitle>
          <CardDescription>Latest 50 execution runs</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test Case</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No executions yet
                  </TableCell>
                </TableRow>
              ) : (
                list.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link
                        href={`/executions/${e.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {e.testCase?.title ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {e.project?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.environment?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={executionStatusBadgeVariant(
                          getExecutionDisplayStatus(
                            e.status,
                            e.executionMetadata?.execution_status
                          )
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
