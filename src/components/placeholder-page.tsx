import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import type { IconName } from "@/components/ui/icon";

/**
 * PlaceholderPage — honest "under construction" surface for routes that are
 * defined in navigation but not yet built. It never renders fake data or dead
 * buttons; it clearly states the screen is pending.
 */
export interface PlaceholderPageProps {
  title: string;
  icon: IconName;
  description: string;
}

export function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <Badge tone="warning">قيد الإنشاء</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      <EmptyState
        icon={icon}
        title="هذه الشاشة لم تُبنَ بعد"
        description="ستتم إضافتها في مرحلة لاحقة. يمكنك الانتقال من القائمة الجانبية إلى الشاشات الجاهزة (لوحة التحكم، الكاشير، المطبخ، الطلبات، الطاولات)."
      />
    </div>
  );
}