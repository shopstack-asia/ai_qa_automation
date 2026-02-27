"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

export default function NewTestCasePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [testType, setTestType] = useState<"API" | "E2E">("E2E");
  const [platform, setPlatform] = useState("");
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/config/platforms")
      .then((r) => (r.ok ? r.json() : { platforms: [] }))
      .then((data) =>
        setPlatformOptions(
          Array.isArray(data?.platforms)
            ? data.platforms.map((p: string | { name: string }) => (typeof p === "string" ? p : p.name))
            : []
        )
      )
      .catch(() => setPlatformOptions([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          priority,
          status: "DRAFT",
          testType,
          platform: platform.trim() || undefined,
          source: "manual",
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

  const selectClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Add test case"
        subtitle="Create a new test case for this project"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${projectId}`}>← Back to project</Link>
          </Button>
        }
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New test case</CardTitle>
          <CardDescription>Title is required. Test type and platform describe what this test runs (read-only on detail).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="title" className="block text-sm font-medium text-muted-foreground">
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. User can log in with valid credentials"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="testType" className="block text-sm font-medium text-muted-foreground">
                  Test type
                </label>
                <select
                  id="testType"
                  value={testType}
                  onChange={(e) => setTestType(e.target.value as "API" | "E2E")}
                  className={selectClass}
                >
                  <option value="E2E">E2E</option>
                  <option value="API">API</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="platform" className="block text-sm font-medium text-muted-foreground">
                  Platform
                </label>
                <select
                  id="platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className={selectClass}
                >
                  <option value="">—</option>
                  {platformOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="priority" className="block text-sm font-medium text-muted-foreground">
                Priority
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW")}
                className={selectClass}
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create test case"}
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
