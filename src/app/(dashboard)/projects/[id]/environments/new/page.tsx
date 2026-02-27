"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

export default function NewEnvironmentPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [type, setType] = useState<"API" | "E2E">("E2E");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !baseUrl.trim()) {
      setError("Name and Base URL are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          type,
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? (typeof data.error === "object" ? "Invalid input" : data.error) ?? "Failed to create");
        return;
      }
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Add environment"
        subtitle="Configure an environment for this project"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${projectId}`}>← Back to project</Link>
          </Button>
        }
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New environment</CardTitle>
          <CardDescription>Name and base URL are required. Type defaults to E2E.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-muted-foreground">
                Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Staging"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="baseUrl" className="block text-sm font-medium text-muted-foreground">
                Base URL
              </label>
              <Input
                id="baseUrl"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://staging.example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="type" className="block text-sm font-medium text-muted-foreground">
                Type
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as "API" | "E2E")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="E2E">E2E</option>
                <option value="API">API</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-muted-foreground">
                Active
              </label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create environment"}
              </Button>
              <Button type="button" variant="secondary" asChild>
                <Link href={`/projects/${projectId}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
