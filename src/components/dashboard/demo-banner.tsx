import { Icon } from "@/components/ui/icon";

/**
 * DemoBanner — makes it unmistakable that the numbers on screen are fabricated
 * preview data, not real sales. Keeps the demo honest per the product rules.
 */
export function DemoBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground">
        <Icon name="sparkles" size={15} />
      </span>
      <p className="text-foreground">
        <span className="font-semibold">وضع المعاينة:</span> جميع الأرقام والطلبات أدناه بيانات تجريبية للتوضيح فقط، وليست مبيعات أو طلبات حقيقية. سيتم ربطها بقاعدة البيانات لاحقاً.
      </p>
    </div>
  );
}