"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/format";

/**
 * TopbarSearch — real, branch-scoped search over products + orders.
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
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [active, setActive] = useState(-1)
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    const q = query.trim()
    setResults([]); setActive(-1); setError(''); setLoading(!!q)
    if (!q) return () => controller.abort()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/staff/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
        if (!res.ok) throw new Error('search failed')
        const data = await res.json()
        const out: SearchResult[] = []
        for (const p of data.products ?? []) out.push({ id: `p-${p.id}`, label: p.name, hint: formatCurrency(Number(p.price)), icon: 'products', href: `/products?q=${encodeURIComponent(p.name)}&selected=${encodeURIComponent(p.id)}` })
        for (const o of data.orders ?? []) out.push({ id: `o-${o.id}`, label: o.number, hint: `طاولة ${o.tableNumber}`, icon: 'orders', href: `/orders?q=${encodeURIComponent(o.number)}&selected=${encodeURIComponent(o.id)}` })
        if (alive) setResults(out.slice(0, 6))
      } catch {
        if (alive) setError(navigator.onLine ? 'تعذر البحث. حاول مرة أخرى.' : 'الاتصال منقطع. أعد الاتصال وحاول مجددًا.')
      } finally { if (alive) setLoading(false) }
    }, 300)
    return () => { alive = false; clearTimeout(timer); controller.abort() }
  }, [query, retry])
  function go(href: string) { setOpen(false); router.push(href) }
  return <div ref={root} className="relative w-full max-w-xs">
    <Input icon="search" role="combobox" aria-expanded={open && !!query.trim()} aria-controls={listId}
      aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      value={query} maxLength={60} onChange={event => { setQuery(event.target.value); setOpen(true) }}
      onFocus={() => setOpen(true)} onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
          setActive(index => results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : -1)
        }
        if (event.key === 'Enter' && open && results.length) { event.preventDefault(); go(results[Math.max(active, 0)].href) }
      }} placeholder="بحث في المنتجات والطلبات…" aria-label="بحث في المنتجات والطلبات" />
    {open && query.trim() && <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-lg border border-border bg-card p-1 shadow-lg">
      <p role="status" className="px-3 py-2 text-sm text-muted-foreground">{loading ? 'جارٍ البحث…' : error || (results.length ? `${results.length} نتائج` : 'لا توجد نتائج مطابقة.')}</p>
      {error && <button type="button" className="min-h-11 px-3 underline" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</button>}
      <ul id={listId} role="listbox" aria-label="نتائج البحث" className="max-h-80 overflow-y-auto">
        {results.map((result, index) => <li key={result.id} role="option" id={`${listId}-${index}`} aria-selected={index === active}>
          <button type="button" onFocus={() => setActive(index)} onClick={() => go(result.href)} className={`flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-start text-sm hover:bg-accent ${index === active ? 'bg-accent' : ''}`}>
            <Icon name={result.icon} size={18} /><span className="min-w-0 flex-1 break-words">{result.label}</span><span className="text-xs text-muted-foreground">{result.hint}</span>
          </button>
        </li>)}
      </ul>
    </div>}
  </div>
}
