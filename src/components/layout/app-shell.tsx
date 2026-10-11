"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

/**
 * AppShell — the shared admin frame: a sticky sidebar (off-canvas drawer on
 * mobile), a sticky topbar, and the routed content. Closing the drawer on
 * navigation keeps mobile navigation predictable.
 */
export function AppShell({
  children,
  user,
  branchName,
}: {
  children: ReactNode;
  /** Signed-in staff identity resolved server-side in the (app) layout. */
  user?: { name: string; role: string };
  /** Current branch label resolved server-side (null = owner, all branches). */
  branchName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} branchName={branchName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen((o) => !o)} user={user} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}