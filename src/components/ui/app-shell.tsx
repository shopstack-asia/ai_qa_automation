"use client";

import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = 200;

interface AppShellProps {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ sidebar, topbar, children, className }: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <aside
        className="fixed left-0 top-0 z-40 h-screen border-r border-border bg-surface"
        style={{ width: SIDEBAR_WIDTH }}
      >
        {sidebar}
      </aside>
      <div
        className="flex flex-col transition-[margin]"
        style={{ marginLeft: SIDEBAR_WIDTH }}
      >
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-border bg-background">
          {topbar}
        </header>
        <main className="min-h-0 overflow-visible p-6 pb-10">{children}</main>
      </div>
    </div>
  );
}

export const SIDEBAR_WIDTH_PX = SIDEBAR_WIDTH;
