import { AppShell } from "@/components/ui/app-shell";
import { SidebarNav } from "@/components/ui/sidebar-nav";
import { Topbar } from "@/components/ui/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      sidebar={<SidebarNav />}
      topbar={<Topbar />}
    >
      {children}
    </AppShell>
  );
}
