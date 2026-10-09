"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Icon, type IconName } from "@/components/ui/icon";
import { products } from "@/lib/demo";
import { recentOrders, sourceLabel } from "@/lib/demo/orders";
import { formatCurrency } from "@/lib/format";

/**
 * TopbarSearch — a real, functional search over the demo data (products and
 * recent orders). It demonstrates the intended search behaviour without any
 * backend: typing filters local records and navigating from a result works.
 * Replace the `useMemo` source with a real query later; the UI need not change.
 */

interface SearchResult {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  href: string;
}

export function TopbarSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];
    for (const p of products) {
      if (p.name.toLowerCase().includes(q)) {
        out.push({ id: `p-${p.id}`, label: p.name, hint: formatCurrency(p.price), icon: "products", href: "/products" });
      }
    }
    for (const o of recentOrders) {
      if (o.number.toLowerCase().includes(q) || o.table.includes(q)) {
        out.push({
          id: `o-${o.id}`,
          label: o.number,
          hint: `${o.table} · ${sourceLabel(o.source)}`,
          icon: "orders",
          href: "/orders",
        });
      }
    }
    return out.slice(0, 6);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div className="relative w-full max-w-xs">
      <Input
        icon="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && results[0]) go(results[0].href);
        }}
        placeholder="بحث في المنتجات والطلبات…"
        aria-label="بحث"
        className="h-10"
      />

      {open && query.trim() ? (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-fade-in">
          {results.length ? (
            <ul className="max-h-80 overflow-y-auto p-1">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => go(r.href)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-start text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name={r.icon} size={18} className="text-muted-foreground" />
                    <span className="flex-1 truncate text-foreground">{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">لا توجد نتائج مطابقة.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}