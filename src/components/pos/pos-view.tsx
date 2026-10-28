"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Dropdown } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { usePosCart, DEMO_TAX_RATE, DEMO_DISCOUNTS } from "@/lib/pos/use-pos-cart";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * POS view — interactive demo checkout. All state lives in `usePosCart`.
 * No real payment, order or database write happens; the demo tax/discount
 * rates are clearly labelled as configurable.
 */
export function PosView() {
  const pos = usePosCart();

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Product browser */}
      <div className="flex flex-col gap-3">
        <Input icon="search" value={pos.query} onChange={(e) => pos.setQuery(e.target.value)} placeholder="ابحث عن منتج…" aria-label="بحث المنتجات" />
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {pos.categoryOptions.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => pos.setCategory(c.value)}
              aria-pressed={pos.category === c.value}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pos.category === c.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {pos.visible.length === 0 ? (
          <EmptyState icon="products" title="لا توجد منتجات مطابقة" description="جرّب بحثاً أو تصنيفاً آخر." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {pos.visible.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!p.available}
                onClick={() => pos.add(p)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center transition-colors",
                  p.available ? "hover:border-primary/50 hover:bg-accent/40" : "cursor-not-allowed opacity-50",
                )}
              >
                <span className="text-3xl">{p.emoji}</span>
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <span className="text-sm font-semibold text-primary">{formatCurrency(p.price)}</span>
                {!p.available ? <Badge tone="muted">غير متوفر</Badge> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <Card className="flex h-fit flex-col lg:sticky lg:top-24">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>السلة</CardTitle>
          {pos.cart.length ? (
            <Button variant="ghost" size="sm" onClick={pos.clear} className="text-destructive">
              <Icon name="trash" size={16} /> إفراغ
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Segmented
            options={[
              { value: "dine_in", label: "داخل الكافيه" },
              { value: "takeaway", label: "سفري" },
            ]}
            value={pos.orderType}
            onChange={(v) => pos.setOrderType(v as "dine_in" | "takeaway")}
            ariaLabel="نوع الطلب"
          />
          {pos.orderType === "dine_in" ? (
            <Dropdown label="الطاولة" options={pos.availableTables.map((t) => ({ value: t.number, label: `الطاولة ${t.number}` }))} value={pos.tableNo} onChange={pos.setTableNo} />
          ) : null}

          {pos.cart.length === 0 ? (
            pos.placed ? (
              <EmptyState icon="check" title="تم إنشاء الطلب (تجريبي)" description="لم يُسجَّل أي طلب حقيقي ولا خصم فعلي. اضغط «طلب جديد» للمتابعة." />
            ) : (
              <EmptyState icon="pos" title="السلة فارغة" description="اختر منتجات لإضافتها." />
            )
          ) : (
            <ul className="flex flex-col gap-2">
              {pos.cart.map((i) => (
                <li key={i.product.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <span className="text-xl">{i.product.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-sm font-medium text-foreground">{i.product.name}</span>
                    <span className="text-xs text-muted-foreground">{formatCurrency(i.product.price * i.qty)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => pos.dec(i.product.id)} aria-label="إنقاص">
                      <Icon name="minus" size={14} />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">{i.qty}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => pos.inc(i.product.id)} aria-label="زيادة">
                      <Icon name="plus" size={14} />
                    </Button>
                  </div>
                  <button type="button" onClick={() => pos.removeItem(i.product.id)} aria-label="حذف" className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Icon name="close" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">خصم تجريبي (قابل للإعداد)</span>
            <Segmented options={DEMO_DISCOUNTS.map((d) => ({ value: String(d.value), label: d.label }))} value={String(pos.discountPct)} onChange={(v) => pos.setDiscountPct(Number(v))} ariaLabel="الخصم" />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
            <Row label="المجموع" value={formatCurrency(pos.subtotal)} />
            {pos.discountPct > 0 ? <Row label={`خصم ${pos.discountPct}%`} value={`- ${formatCurrency(pos.discountAmount)}`} tone="success" /> : null}
            <Row label={`ضريبة تجريبية ${DEMO_TAX_RATE}%`} value={formatCurrency(pos.taxAmount)} />
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-bold">
              <span className="text-foreground">الإجمالي</span>
              <span className="text-primary">{formatCurrency(pos.total)}</span>
            </div>
          </div>

          <Button size="lg" className="w-full" disabled={!pos.cart.length} onClick={pos.checkout}>
            <Icon name="check" size={18} />
            {pos.orderType === "dine_in" ? `تأكيد الطلب — الطاولة ${pos.tableNo}` : "تأكيد الطلب السفري"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {formatNumber(pos.itemCount)} صنف · عملية دفع تجريبية بدون تحصيل حقيقي
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === "success" ? "font-medium text-success" : "text-foreground"}>{value}</span>
    </div>
  );
}