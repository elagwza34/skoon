"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups } from "@/lib/navigation";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { activeBranch } from "@/lib/demo";
import { cn } from "@/lib/utils";

/**
 * Sidebar — brand mark, grouped navigation, current-branch card and the
 * dark/light toggle. Highlights the active route and collapses to an
 * off-canvas drawer on small screens (managed by AppShell).
 */

function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop for the mobile drawer */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-border bg-card",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
          "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Icon name="utensils" size={20} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold text-foreground">سكون</span>
            <span className="text-[11px] text-muted-foreground">نظام إدارة الكافيه</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4" aria-label="التنقل الرئيسي">
          {navGroups.map((group, gi) => (
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
                    <Icon name={item.icon} size={20} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge != null ? (
                      <span
                        className={cn(
                          "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
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
              <span className="truncate text-sm font-medium text-foreground">{activeBranch.name}</span>
            </div>
            <span className="ms-auto rounded bg-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {activeBranch.code}
            </span>
          </div>
          <ThemeToggle variant="full" className="w-full justify-start" />
        </div>
      </aside>
    </>
  );
}