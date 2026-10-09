import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * QuickActions — real navigation shortcuts to the main operational screens.
 * Each link navigates to a working route (no dead buttons).
 */

const ACTIONS: { href: string; label: string; icon: IconName; desc: string }[] = [
  { href: "/pos", label: "فتح الكاشير", icon: "pos", desc: "بدء طلب جديد" },
  { href: "/orders", label: "متابعة الطلبات", icon: "orders", desc: "كل الطلبات" },
  { href: "/kitchen", label: "شاشة المطبخ", icon: "kitchen", desc: "قيد التحضير" },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>إجراءات سريعة</CardTitle>
        <CardDescription>اختصارات للشاشات التشغيلية</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {ACTIONS.map((a) => (
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}