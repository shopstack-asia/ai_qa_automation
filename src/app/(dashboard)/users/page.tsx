"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const [list, setList] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "qa" as "admin" | "manager" | "qa",
    isActive: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = () => {
    setLoading(true);
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Forbidden or error"))))
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openDrawer = () => {
    setDrawerOpen(true);
    setEditingUserId(null);
    setError("");
    setForm({ email: "", password: "", name: "", role: "qa", isActive: true });
  };

  const openEditDrawer = async (user: UserItem) => {
    setDrawerOpen(true);
    setEditingUserId(user.id);
    setError("");
    setForm({
      email: user.email,
      password: "",
      name: user.name ?? "",
      role: user.role as "admin" | "manager" | "qa",
      isActive: user.isActive,
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim()) {
      setError("Email is required");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim() || undefined,
          role: form.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      setDrawerOpen(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setError("");
    if (!form.email.trim()) {
      setError("Email is required");
      return;
    }
    if (form.password && form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        role: form.role,
        isActive: form.isActive,
      };
      if (form.password) {
        body.password = form.password;
      }
      const res = await fetch(`/api/users/${editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update user");
      setDrawerOpen(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  const selectClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Users"
        subtitle="Create and manage users and roles (admin)"
        actions={
          <Button size="sm" onClick={openDrawer}>
            Add user
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>User management</CardTitle>
          <CardDescription>
            Invite users and assign roles: admin, manager, or qa.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[1%] whitespace-nowrap">Actions</TableHead>
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
                    No users yet. Add a user (admin only).
                  </TableCell>
                </TableRow>
              ) : (
                list.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground">{u.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="default">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          u.isActive
                            ? "text-sm text-success"
                            : "text-sm text-muted-foreground"
                        }
                      >
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDrawer(u)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <div>
                <SheetTitle>{editingUserId ? "Edit user" : "Add user"}</SheetTitle>
                <SheetDescription>
                  {editingUserId
                    ? "Update user information. Leave password blank to keep current password."
                    : "Create a new user. Password must be at least 8 characters."}
                </SheetDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  type="submit"
                  form="user-form"
                  disabled={submitting}
                  size="sm"
                >
                  {submitting
                    ? editingUserId
                      ? "Updating…"
                      : "Creating…"
                    : editingUserId
                      ? "Update user"
                      : "Create user"}
                </Button>
              </div>
            </div>
          </SheetHeader>
          <form
            id="user-form"
            onSubmit={editingUserId ? handleUpdate : handleCreate}
            className="flex flex-col flex-1"
          >
            <SheetBody>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="user@example.com"
                    required
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Password {editingUserId && "(leave blank to keep current)"}
                  </label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder={editingUserId ? "Leave blank to keep current" : "Min 8 characters"}
                    minLength={editingUserId ? 0 : 8}
                    required={!editingUserId}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Name (optional)</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Display name"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, role: e.target.value as "admin" | "manager" | "qa" }))
                    }
                    className={selectClass}
                  >
                    <option value="qa">QA</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {editingUserId && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Status
                    </label>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.isActive}
                        onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))}
                      />
                      <span className="text-sm text-muted-foreground">
                        {form.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
