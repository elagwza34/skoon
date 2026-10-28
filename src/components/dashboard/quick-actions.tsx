"use client";

import Link from "next/link";
import { canSeeRoute } from "@/lib/route-access";
import { isOwner } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";

/** QuickActions â€” real navigation shortcuts to the main operational screens.
 * Each link navigates to a working route (no dead buttons).
 * Owner and roles with the required permission see the matching action.
 */
const ACTIONS: { href: string; label: string; icon: IconName; desc: string; requiredPermission?: string }[] = [
  { href: "/pos", label: "ÙØªØ­ Ø§Ù„ÙƒØ§Ø´ÙŠØ±", icon: "pos", desc: "Ø¨Ø¯Ø¡ Ø·Ù„Ø¨ Ø¬Ø¯ÙŠØ¯", requiredPermission: "/pos" },
  { href: "/orders", label: "Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ø·Ù„Ø¨Ø§Øª", icon: "orders", desc: "ÙƒÙ„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª", requiredPermission: "/orders" },
  { href: "/kitchen", label: "Ø´Ø§Ø´Ø© Ø§Ù„Ù…Ø·Ø¨Ø®", icon: "kitchen", desc: "Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ø¶ÙŠØ±", requiredPermission: "/kitchen" },
  { href: "/reports", label: "Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±", icon: "reports", desc: "Ø§Ù„ØªØ§Ù„ÙŠ ÙˆØ§Ù„ØªØ­Ù„ÙŠÙ„", requiredPermission: "/reports" },
];

export function QuickActions({ user }: { user?: { role?: string; permissions?: string[] } }) {
  const role = user?.role ?? "";
  const perms = user?.permissions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø³Ø±ÙŠØ¹Ø©</CardTitle>
        <CardDescription>Ø§Ø®ØªØµØ§Ø±Ø§Øª Ù„Ù„Ø´Ø§Ø´Ø§Øª Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ© ÙˆØ§Ù„Ù…Ø­Ù„Ù„Ø©</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {ACTIONS.map((a) => {
            const required = a.requiredPermission ?? null;
            const allowed = isOwner(role) || canSeeRoute((role as string) ?? "", required ? [required] : [], a.href);
            if (!allowed) return null;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Icon name={a.icon} size={20} />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-sm font-medium text-foreground">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.desc}</span>
                </span>
                <Icon name="chevronLeft" size={18} className="ms-auto text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}


