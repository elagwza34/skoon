"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { titleForPath } from "@/lib/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { Popover } from "@/components/ui/popover";
import { TopbarSearch } from "@/components/layout/topbar-search";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { formatDate } from "@/lib/format";
import { ROLE } from "@/lib/authz";
import { logoutAction } from "@/app/login/actions";

/**
 * Topbar â€” page title + today's date, functional branch-scoped search, a live
 * notifications bell, and an account menu with the real signed-in identity.
 */

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
  user?: { name: string; role: string; permissions?: string[] };
}

export function Topbar({ onMenu, user }: TopbarProps) {
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
      <div className="flex min-w-0 items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 lg:px-6">
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

        <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden md:block">
            <TopbarSearch />
          </div>

          {/* Notifications â€” live, self-fetching bell (works for every role). */}
          <NotificationsBell />

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


