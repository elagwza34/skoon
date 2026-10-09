import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Route group for the authenticated admin experience. All pages under this
 * group share the AppShell (sidebar + topbar). Auth is not wired yet — the
 * shell renders demo content only.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}