import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { formatCurrency, formatNumber } from "@/lib/format";

/**
 * TopProducts â€” best sellers with a proportional bar.
 * Presentational (server) component fed by real DB aggregates.
 */
export function TopProducts({
  products,
}: {
  products: { name: string; emoji: string; qty: number; revenue: number }[];
}) {

  const max = Math.max(1, ...products.map((p) => p.revenue));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ø§Ù„Ø£ÙƒØ«Ø± Ù…Ø¨ÙŠØ¹Ø§Ù‹</CardTitle>
        <CardDescription>Ø­Ø³Ø¨ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯ â€” Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</CardDescription>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„ÙŠÙˆÙ… Ø¨Ø¹Ø¯.</p>
        ) : (
        <ol className="flex flex-col gap-3">
          {products.map((p, i) => (
            <li key={p.name} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-base">{p.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{formatNumber(p.qty)} Ã— Â· ØªØ±ØªÙŠØ¨ {i + 1}</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(p.revenue)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(p.revenue / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
        )}
      </CardContent>
    </Card>
  );
}

