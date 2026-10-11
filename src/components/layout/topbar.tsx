"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { titleForPath } from "@/lib/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { Popover } from "@/components/ui/popover";
import { TopbarSearch } from "@/components/layout/topbar-search";
import { formatDate } from "@/lib/format";
import { ROLE } from "@/lib/authz";
import { logoutAction } from "@/app/login/actions";

/**
 * Topbar â€” page title + today's date, functional branch-scoped search,
 * account menu with real signed-in identity. Notifications show live
 * counts when provided (empty state otherwise â€” no fabricated alerts).
 */

const NOTIF_TONE: Record<string, string> = {
  info: "bg-primary text-primary-foreground",
  warning: "bg-warning text-warning-foreground",
  success: "bg-success text-success-foreground",
};

export interface TopbarNotification {
  title: string;
  time: string;
  tone: "info" | "warning" | "success";
}

const ROLE_LABEL: Record<string, string> = {
  [ROLE.OWNER]: "Ù…Ø§Ù„Ùƒ",
  [ROLE.MANAGER]: "Ù…Ø¯ÙŠØ±",
  [ROLE.CASHIER]: "ÙƒØ§Ø´ÙŠØ±",
  [ROLE.WAITER]: "ÙˆÙŠØªØ±",
  [ROLE.KITCHEN]: "Ù…Ø·Ø¨Ø®",
};

function TodayDate() {
  const [text, setText] = useState("");
  useEffect(() => setText(formatDate(new Date())), []);
  if (!text) return <span className="text-sm text-muted-foreground">â€”</span>;
  return <span className="text-sm text-muted-foreground">{text}</span>;
}

export interface TopbarProps {
  onMenu: () => void;
  /** Signed-in staff identity (server-resolved, required in production). */
  user?: { name: string; role: string };
  /** Live notifications (real data). Empty = show honest empty state. */
  notifications?: TopbarNotification[];
}

export function Topbar({ onMenu, user, notifications = [] }: TopbarProps) {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  // Signed-in account (server-resolved). Fallback keeps the shell usable
  // only when the layout guard is bypassed in isolation.
  const account = user ?? { name: "â€”", role: "" };
  const initials =
    account.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "?";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="ÙØªØ­ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©"
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

          {/* Notifications â€” live data only; honest empty state when none. */}
          <Popover
            ariaLabel="Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª"
            panelClassName="w-80"
            trigger={(p) => (
              <button
                {...p}
                aria-label="Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="bell" size={20} />
                {notifications.length > 0 ? (
                <span className="absolute -top-0.5 -end-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {notifications.length}
                </span>
                ) : null}
              </button>
            )}
          >
            {() => (
              <div className="w-80">
                <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª</div>
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø¬Ø¯ÙŠØ¯Ø©.</p>
                ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {notifications.map((n, i) => (
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
                )}
              </div>
            )}
          </Popover>

          {/* Account */}
          <Popover
            ariaLabel="Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø­Ø³Ø§Ø¨"
            panelClassName="w-60"
            trigger={(p) => (
              <button
                {...p}
                aria-label="Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø­Ø³Ø§Ø¨"
                className="inline-flex items-center gap-2 rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar name={account.name} initials={initials} size="md" />
              </button>
            )}
          >
            {(close) => (
              <div>
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Avatar name={account.name} initials={initials} size="md" />
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-semibold text-foreground">{account.name}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[account.role] ?? account.role}</span>
                  </div>
                </div>
                <div className="p-1">
                  <Link
                    href="/settings"
                    onClick={close}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <Icon name="settings" size={16} className="text-muted-foreground" />
                    Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª
                  </Link>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent"
                    >
                      <Icon name="logout" size={16} />
                      ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬
                    </button>
                  </form>
                </div>
              </div>
            )}
          </Popover>
        </div>
      </div>
    </header>
  );
}