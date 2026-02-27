"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLogo } from "@/components/ui/app-logo";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Users,
  ScrollText,
  ClipboardList,
  HardDrive,
} from "lucide-react";
import { Role } from "@prisma/client";

type NavItem =
  | { type: "link"; href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }
  | { type: "section"; label: string };

const allNavItems: NavItem[] = [
  { type: "link", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/projects", label: "Projects", icon: FolderKanban },
  { type: "link", href: "/config", label: "Config", icon: Settings, adminOnly: true },
  { type: "link", href: "/users", label: "Users", icon: Users, adminOnly: true },
  { type: "section", label: "Monitoring" },
  { type: "link", href: "/monitoring/openai-logs", label: "OpenAI Logs", icon: ScrollText },
  { type: "link", href: "/monitoring/s3-logs", label: "S3 Logs", icon: HardDrive },
  { type: "link", href: "/queue-monitor", label: "Queue Monitor", icon: ClipboardList },
];

export function SidebarNav() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<Role | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) {
          setUserRole(data.role as Role);
        }
      })
      .catch(() => {
        // Ignore errors
      });
  }, []);

  const nav = userRole === "admin" 
    ? allNavItems 
    : allNavItems.filter((item) => !("adminOnly" in item && item.adminOnly));

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-6">
        <AppLogo />
      </div>
      <nav className="flex-1 space-y-0.5 p-3" aria-label="Main">
        {nav.map((item, idx) => {
          if (item.type === "section") {
            return (
              <div
                key={`section-${idx}-${item.label}`}
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {item.label}
              </div>
            );
          }
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(59,130,246,0.15)]"
                  : "text-muted-foreground hover:bg-elevated hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
