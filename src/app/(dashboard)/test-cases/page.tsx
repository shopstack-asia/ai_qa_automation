"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function TestCasesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Test Cases"
        subtitle="Manage and create test cases per project"
      />

      <Card>
        <CardHeader>
          <CardTitle>Test cases</CardTitle>
          <CardDescription>
            Create, edit, and organize test cases with structured plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Test case list will be loaded by project.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
