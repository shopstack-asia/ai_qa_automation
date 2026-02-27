"use client";

import { useRouter } from "next/navigation";

export function Header() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end border-b border-border bg-background px-6">
      <button
        type="button"
        onClick={handleLogout}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Logout
      </button>
    </header>
  );
}
