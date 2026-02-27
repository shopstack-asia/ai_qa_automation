"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function NewSchedulePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Create schedule"
        subtitle="Set up a recurring test run"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/config/schedules">← Back to Schedules</Link>
          </Button>
        }
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New schedule</CardTitle>
          <CardDescription>
            Select project, environment, cron expression, and test cases to run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Schedule creation form (project, environment, cron, test case selection) can be added here.
          </p>
          <Button variant="secondary" asChild>
            <Link href="/config/schedules">Back to Schedules</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
