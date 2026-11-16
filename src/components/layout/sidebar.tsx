"use client";

import { Modal } from '@/components/ui/modal';
import { useMediaQuery } from '@/lib/use-media-query';
import { useEffect } from 'react';
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { navGroups as DEFAULT_GROUPS, type NavGroup } from "@/lib/navigation";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Sidebar — brand mark, grouped navigation, current-branch card and the
 * dark/light toggle. Branch identity comes from the signed-in session
 * (AppShell prop) — no fabricated branch data. The visible links are supplied
 * pre-filtered by the AppShell from the role's permissions.
 */

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
  /** Current branch label (server-resolved session). */
  branchName?: string | null;
  /** Permission-filtered nav groups from the AppShell. Defaults to all. */
  groups?: NavGroup[];
  /** Canonical role home supplied by the permission-filtered navigation. */
  homeHref?: string;
}

export function Sidebar({ open, onClose, branchName, groups = DEFAULT_GROUPS, homeHref = "/dashboard" }: SidebarProps) {
  const pathname = usePathname();

  const mobile = useMediaQuery('(max-width: 1023px)');
  useEffect(() => { if (!mobile && open) onClose(); }, [mobile, open, onClose]);
  const content = <>
        {/* Brand */}
        <Link href={homeHref} onClick={onClose} className="flex items-center gap-2.5 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Image
            src="/logo.png"
            alt="شعار سكون"
            width={44}
            height={44}
            priority
            className="h-11 w-11 shrink-0 object-contain"
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-base font-bold text-foreground">سكون</span>
            <span className="text-[11px] text-muted-foreground">نظام إدارة الكافيه</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4" aria-label="التنقل الرئيسي">
          {groups.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {group.title ? (
                <p className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
              ) : (
                <div className="pt-2" />
              )}
              {group.items.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Icon name={item.icon} size={20} className="shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge != null ? (
                      <span
                        className={cn(
                          "inline-flex min-w-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                          active ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer: current branch + theme toggle */}
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-md bg-accent/50 px-3 py-2">
            <Icon name="branch" size={18} className="text-muted-foreground" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-[11px] text-muted-foreground">الفرع الحالي</span>
              <span className="truncate text-sm font-medium text-foreground">{branchName ?? "كل الفروع"}</span>
            </div>
          </div>
          <ThemeToggle variant="full" className="w-full justify-start" />
        </div>
  </>;
  return <>
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-card lg:flex">{content}</aside>
    {mobile && open && <Modal id="staff-navigation" aria-label="التنقل الرئيسي" onClose={onClose} className="fixed inset-0 z-50 bg-black/60 p-0">
      <aside className="flex h-full w-64 max-w-full flex-col bg-card">
        <button type="button" autoFocus onClick={onClose} className="m-2 min-h-11 rounded border px-3">إغلاق القائمة</button>
        {content}
      </aside>
    </Modal>}
  </>;
}
