"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/format";

/**
 * TopbarSearch â€” real, branch-scoped search over products + orders.
 * Queries /api/staff/search (server enforces session + branch scope).
 * Debounced; empty/error states handled with Arabic messages.
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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/staff/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        const out: SearchResult[] = [];
        for (const p of data.products ?? []) {
          out.push({
            id: `p-${p.id}`, label: p.name,
            hint: formatCurrency(Number(p.price)), icon: "products", href: "/products",
          });
        }
        for (const o of data.orders ?? []) {
          out.push({
            id: `o-${o.id}`, label: o.number,
            hint: `Ø·Ø§ÙˆÙ„Ø© ${o.tableNumber}`, icon: "orders", href: "/orders",
          });
        }
        setResults(out.slice(0, 6));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
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
        placeholder="Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ÙˆØ§Ù„Ø·Ù„Ø¨Ø§Øªâ€¦"
        aria-label="Ø¨Ø­Ø«"
        className="h-10"
      />

      {open && query.trim() ? (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-fade-in">
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¨Ø­Ø«â€¦</p>
          ) : results.length ? (
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
            <p className="px-4 py-3 text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬ Ù…Ø·Ø§Ø¨Ù‚Ø©.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

