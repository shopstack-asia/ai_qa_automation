"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function EnvironmentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Environments"
        subtitle="Manage environments per project"
      />

      <Card>
        <CardHeader>
          <CardTitle>Environments</CardTitle>
          <CardDescription>
            Select a project to view and manage its environments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Environment list will be loaded by project.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
