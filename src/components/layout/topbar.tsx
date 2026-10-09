"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { titleForPath } from "@/lib/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { Popover } from "@/components/ui/popover";
import { TopbarSearch } from "@/components/layout/topbar-search";
import { branches, demoUser } from "@/lib/demo";
import { demoNotifications } from "@/lib/demo/dashboard";
import { formatDate } from "@/lib/format";
import { ROLE } from "@/lib/authz";

/**
 * Topbar — page title + today's date (client-mounted to avoid hydration
 * mismatch), a functional demo search, notifications, a branch selector and a
 * demo account menu. All content is local demo data; no auth is performed.
 */

const NOTIF_TONE: Record<string, string> = {
  info: "bg-primary text-primary-foreground",
  warning: "bg-warning text-warning-foreground",
  success: "bg-success text-success-foreground",
};

const ROLE_LABEL: Record<string, string> = {
  [ROLE.OWNER]: "مالك",
  [ROLE.MANAGER]: "مدير",
  [ROLE.CASHIER]: "كاشير",
  [ROLE.WAITER]: "ويتر",
  [ROLE.KITCHEN]: "مطبخ",
};

function TodayDate() {
  const [text, setText] = useState("");
  useEffect(() => setText(formatDate(new Date())), []);
  if (!text) return <span className="text-sm text-muted-foreground">—</span>;
  return <span className="text-sm text-muted-foreground">{text}</span>;
}

export interface TopbarProps {
  onMenu: () => void;
}

export function Topbar({ onMenu }: TopbarProps) {
  const pathname = usePathname();
  const title = titleForPath(pathname);
  const [branchId, setBranchId] = useState(String(branches[0].id));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const branchOptions = branches.map((b) => ({ value: String(b.id), label: b.name, icon: "branch" as const }));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      {notice ? (
        <div className="flex items-center justify-between gap-3 bg-primary/15 px-4 py-2 text-sm text-primary">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="إخفاء التنبيه" className="rounded p-1 hover:bg-accent">
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="فتح القائمة"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Icon name="menu" size={22} />
        </button>

        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-lg font-bold leading-tight text-foreground">{title}</h1>
          <TodayDate />
        </div>

        <div className="ms-auto flex items-center gap-2">
          <div className="hidden md:block">
            <TopbarSearch />
          </div>

          <Dropdown label="الفرع" options={branchOptions} value={branchId} onChange={setBranchId} className="hidden sm:inline-flex" />

          {/* Notifications */}
          <Popover
            ariaLabel="الإشعارات"
            trigger={(p) => (
              <button
                {...p}
                aria-label="الإشعارات"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="bell" size={20} />
                <span className="absolute -top-0.5 -end-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {demoNotifications.length}
                </span>
              </button>
            )}
          >
            {() => (
              <div className="w-80">
                <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">الإشعارات</div>
                <ul className="max-h-80 overflow-y-auto">
                  {demoNotifications.map((n, i) => (
                    <li key={i} className="flex items-start gap-3 border-b border-border/50 px-4 py-3 last:border-0">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${NOTIF_TONE[n.tone]}`}>
                        <Icon name={n.tone === "warning" ? "flame" : n.tone === "success" ? "check" : "bell"} size={15} />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm text-foreground">{n.title}</span>
                        <span className="text-xs text-muted-foreground">{n.time}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Popover>

          {/* Account */}
          <Popover
            ariaLabel="قائمة الحساب"
            panelClassName="w-60"
            trigger={(p) => (
              <button
                {...p}
                aria-label="قائمة الحساب"
                className="inline-flex items-center gap-2 rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar name={demoUser.name} initials={demoUser.initials} size="md" />
              </button>
            )}
          >
            {(close) => (
              <div>
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Avatar name={demoUser.name} initials={demoUser.initials} size="md" />
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-semibold text-foreground">{demoUser.name}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[demoUser.role]}</span>
                  </div>
                </div>
                <div className="p-1">
                  <Link
                    href="/settings"
                    onClick={close}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <Icon name="settings" size={16} className="text-muted-foreground" />
                    الإعدادات
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      setNotice("تم تسجيل الخروج — هذه معاينة بدون مصادقة حقيقية.");
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent"
                  >
                    <Icon name="logout" size={16} />
                    تسجيل الخروج
                  </button>
                </div>
              </div>
            )}
          </Popover>
        </div>
      </div>
    </header>
  );
}