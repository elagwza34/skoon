"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { navGroups, navGroupsFor } from "@/lib/navigation";
import { isOwner } from "@/lib/authz";
import { canSeeRoute } from "@/lib/route-access";

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
  user?: { name: string; role: string; permissions?: string[] };
  /** Current branch label resolved server-side (null = owner, all branches). */
  branchName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll while the mobile drawer is open so the page behind
  // doesn't jump (a common cause of the "layout looks broken" feeling on iOS
  // Safari, where the dynamic toolbar shifts the 100vh viewport).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Sidebar links filtered to the role's permissions. Owner sees everything.
  // The server-side guard in the (app) layout is the real gate; this only
  // avoids offering links the role would be bounced from.
  const groups = useMemo(() => {
    const role = user?.role ?? "";
    const perms = user?.permissions ?? [];
    if (!role) return [];
    if (isOwner(role)) return navGroups;
    return navGroupsFor(role, (href) => canSeeRoute(role, perms, href));
  }, [user?.role, user?.permissions]);

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} branchName={branchName} groups={groups} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen((o) => !o)} user={user} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}