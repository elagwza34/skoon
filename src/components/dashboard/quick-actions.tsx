"use client";

import Link from "next/link";
import { canSeeRoute } from "@/lib/route-access";
import { isOwner } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";

/** QuickActions — real navigation shortcuts to the main operational screens.
 * Each link navigates to a working route (no dead buttons).
 * Owner and roles with the required permission see the matching action.
 */
const ACTIONS: { href: string; label: string; icon: IconName; desc: string; requiredPermission?: string }[] = [
  { href: "/pos", label: "فتح الكاشير", icon: "pos", desc: "بدء طلب جديد", requiredPermission: "/pos" },
  { href: "/orders", label: "متابعة الطلبات", icon: "orders", desc: "كل الطلبات", requiredPermission: "/orders" },
  { href: "/kitchen", label: "شاشة المطبخ", icon: "kitchen", desc: "قيد التحضير", requiredPermission: "/kitchen" },
  { href: "/reports", label: "التقارير", icon: "reports", desc: "التالي والتحليل", requiredPermission: "/reports" },
];

export function QuickActions({ user }: { user?: { role?: string; permissions?: string[] } }) {
  const role = user?.role ?? "";
  const perms = user?.permissions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>إجراءات سريعة</CardTitle>
        <CardDescription>اختصارات للشاشات التشغيلية والمحللة</CardDescription>
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
