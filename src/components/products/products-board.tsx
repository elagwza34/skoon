'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StaffCatalog } from '@/lib/staff-catalog'

/**
 * Products board â€” real branch catalog from the DB.
 * Search + category filter client-side; availability toggle via API.
 */
interface ProductDraft {
  id?: string
  name: string
  description: string
  price: string
  categoryId: string
  isAvailable: boolean
  taxRate: string
  inventoryItemId: string
  attributeIds: string[]
  variants: { valueIds: string[]; price: string; inventoryItemId: string }[]
}

const EMPTY_DRAFT: ProductDraft = { name: '', description: '', price: '', categoryId: '', isAvailable: true, taxRate: '0', inventoryItemId: '', attributeIds: [], variants: [] }
type VariantAttribute = { id: string; name: string; values: { id: string; label: string }[] }

export function ProductsBoard({
  catalog,
  canEdit,
  canToggle,
  canManageCategories = false,
  canCreateCategories = false,
  branches = [],
}: {
  catalog: StaffCatalog
  canEdit: boolean
  canToggle?: boolean
  canManageCategories?: boolean
  canCreateCategories?: boolean
  branches?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Product create/edit form state (owner/manager)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT)
  const [createBranchId, setCreateBranchId] = useState(branches.length === 1 ? branches[0].id : '')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([])

  // Category management state (owner/manager)
  const [newCategory, setNewCategory] = useState('')
  const [catBusy, setCatBusy] = useState(false)

  const options = useMemo(
    () => [
      { value: 'all', label: 'Ø§Ù„ÙƒÙ„' },
      ...catalog.categories.map((c) => ({ value: c.id, label: `${c.name} (${c.productsCount})` })),
    ],
    [catalog.categories],
  )

  const rows = useMemo(() => {
    const q = query.trim()
    return catalog.products.filter(
      (p) =>
        (category === 'all' || p.categoryId === category) &&
        (!q || p.name.includes(q)),
    )
  }, [catalog.products, category, query])

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function loadVariantAttributes(branchId: string) {
    if (!branchId) { setVariantAttributes([]); return }
    const response = await fetch(`/api/staff/product-configuration?branchId=${encodeURIComponent(branchId)}`, { cache: 'no-store' })
    if (!response.ok) { setVariantAttributes([]); return }
    const body = await response.json()
    setVariantAttributes(body.attributes ?? [])
  }

  async function toggle(id: string) {
    setPendingId(id)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/products/${id}/toggle`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ÙØ´Ù„ Ø§Ù„ØªØ­Ø¯ÙŠØ«')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ÙØ´Ù„ Ø§Ù„ØªØ­Ø¯ÙŠØ«')
    } finally {
      setPendingId(null)
    }
  }

  function openCreate() {
    setError(null)
    setSuccess(null)
    const initialBranchId = branches.length === 1 ? branches[0].id : ''
    const initialCategory = initialBranchId
      ? catalog.categories.find((item) => item.branchId === initialBranchId)
      : catalog.categories[0]
    setCreateBranchId(initialBranchId)
    setDraft({ ...EMPTY_DRAFT, categoryId: initialCategory?.id ?? '' })
    setShowForm(true)
    void loadVariantAttributes(initialBranchId).catch(() => undefined)
  }

  function openEdit(p: StaffCatalog['products'][number]) {
    setError(null)
    setSuccess(null)
    setDraft({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      price: p.price,
      categoryId: p.categoryId,
      isAvailable: p.isAvailable,
      taxRate: p.taxRate,
      inventoryItemId: p.inventoryItemId ?? '',
      attributeIds: [], variants: [],
    })
    setShowForm(true)
    void loadVariantAttributes(p.branchId).catch(() => undefined)
  }

  async function saveProduct() {
    if (saving) return
    const priceNum = Number(draft.price)
    const taxRate = Number(draft.taxRate || '0')
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('Ø§Ù„Ø³Ø¹Ø± ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø±Ù‚Ù…Ø§Ù‹ Ù…ÙˆØ¬Ø¨Ø§Ù‹')
      return
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setError('Tax rate must be between 0 and 100')
      return
    }
    if (!draft.categoryId) {
      setError('Ø§Ø®ØªØ± Ø§Ù„ØªØµÙ†ÙŠÙ')
      return
    }
    if (!draft.id && branches.length > 0 && !createBranchId) {
      setError('Ø§Ø®ØªØ± Ø§Ù„ÙØ±Ø¹')
      return
    }
    if (!draft.name.trim()) {
      setError('Ø§Ø³Ù… Ø§Ù„Ù…Ù†ØªØ¬ Ù…Ø·Ù„ÙˆØ¨')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const isEdit = Boolean(draft.id)
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        price: priceNum,
        categoryId: draft.categoryId,
        isAvailable: draft.isAvailable,
        taxRate,
        inventoryItemId: draft.inventoryItemId || null,
        ...(draft.attributeIds.length ? {
          attributes: draft.attributeIds.map((attributeId) => ({ attributeId, isRequired: true, minSelections: 1, maxSelections: 1 })),
          variants: draft.variants.map((variant) => ({ valueIds: variant.valueIds.map((valueId) => ({ valueId })), price: Number(variant.price), inventoryItemId: variant.inventoryItemId || null })),
        } : {}),
        ...(isEdit || branches.length <= 1 ? {} : { branchId: createBranchId }),
      }
      const res = await fetch(isEdit ? `/api/staff/products/${draft.id}` : '/api/staff/products', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ÙØ´Ù„ Ø§Ù„Ø­ÙØ¸')
      setShowForm(false)
      setSuccess(isEdit ? 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ù†ØªØ¬' : 'ØªÙ… Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ù†ØªØ¬')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ÙØ´Ù„ Ø§Ù„Ø­ÙØ¸')
    } finally {
      setSaving(false)
    }
  }

  const formCategories = draft.id
    ? catalog.categories
    : createBranchId ? catalog.categories.filter((item) => item.branchId === createBranchId) : []
  const formInventoryItems = draft.id
    ? catalog.inventoryItems
    : createBranchId ? catalog.inventoryItems.filter((item) => item.branchId === createBranchId) : []

  async function archiveProduct(id: string) {
    if (archivingId || !window.confirm('Archive this product? It will remain in historical orders.')) return
    setArchivingId(id)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/products/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Archive failed')
      setSuccess('Product archived')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed')
    } finally {
      setArchivingId(null)
    }
  }

  async function addCategory() {
    if (catBusy) return
    const name = newCategory.trim()
    if (!name) return
    setCatBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/staff/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, ...(branches.length > 1 ? { branchId: createBranchId } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ÙØ´Ù„ Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØªØµÙ†ÙŠÙ')
      setNewCategory('')
      setSuccess('ØªÙ… Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØªØµÙ†ÙŠÙ')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ÙØ´Ù„ Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØªØµÙ†ÙŠÙ')
    } finally {
      setCatBusy(false)
    }
  }

  async function deleteCategory(id: string) {
    if (catBusy) return
    setCatBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/categories/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„ØªØµÙ†ÙŠÙ')
      setSuccess('ØªÙ… Ø­Ø°Ù Ø§Ù„ØªØµÙ†ÙŠÙ')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„ØªØµÙ†ÙŠÙ')
    } finally {
      setCatBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…Ù†ØªØ¬â€¦" aria-label="Ø¨Ø­Ø« Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª" className="max-w-xs"
        />
        <Segmented options={options} value={category} onChange={setCategory} ariaLabel="ØªØµÙÙŠØ© Ø§Ù„ØªØµÙ†ÙŠÙ" />
        {canEdit ? (
          <Button size="sm" className="ms-auto" onClick={openCreate}>
            <Icon name="plus" size={16} /> Ù…Ù†ØªØ¬ Ø¬Ø¯ÙŠØ¯
          </Button>
        ) : null}
      </div>

      {success ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{success}</p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {canEdit && showForm ? (
        <div role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit product' : 'Add product'} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-8 sm:items-center sm:p-6">
        <Card className="w-full max-w-2xl border-primary/40">
          <CardHeader>
            <CardTitle>{draft.id ? 'ØªØ¹Ø¯ÙŠÙ„ Ù…Ù†ØªØ¬' : 'Ù…Ù†ØªØ¬ Ø¬Ø¯ÙŠØ¯'}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Ø§Ù„Ø§Ø³Ù…</span>
              <Input
                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ø§Ø³Ù… Ø§Ù„Ù…Ù†ØªØ¬" aria-label="Ø§Ø³Ù… Ø§Ù„Ù…Ù†ØªØ¬" maxLength={150}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Tax rate (%)</span>
              <Input type="number" inputMode="decimal" min="0" max="100" step="0.01"
                value={draft.taxRate} onChange={(e) => setDraft({ ...draft, taxRate: e.target.value })}
                aria-label="Tax rate" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Inventory mapping</span>
              <select value={draft.inventoryItemId} onChange={(e) => setDraft({ ...draft, inventoryItemId: e.target.value })}
                aria-label="Inventory mapping"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background">
                <option value="">No direct inventory item</option>
                {formInventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {!draft.id && branches.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Ø§Ù„ÙØ±Ø¹</span>
                <select
                  value={createBranchId}
                  onChange={(e) => {
                    const branchId = e.target.value
                    const firstCategory = catalog.categories.find((item) => item.branchId === branchId)
                    setCreateBranchId(branchId)
                    setDraft((current) => ({ ...current, categoryId: firstCategory?.id ?? '', inventoryItemId: '' }))
                    void loadVariantAttributes(branchId)
                  }}
                  aria-label="ÙØ±Ø¹ Ø§Ù„Ù…Ù†ØªØ¬"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <option value="">Ø§Ø®ØªØ± Ø§Ù„ÙØ±Ø¹â€¦</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Ø§Ù„Ø³Ø¹Ø± (Ø¬.Ù…)</span>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                placeholder="0.00" aria-label="Ø³Ø¹Ø± Ø§Ù„Ù…Ù†ØªØ¬"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Ø§Ù„ØªØµÙ†ÙŠÙ</span>
              <select
                value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                aria-label="ØªØµÙ†ÙŠÙ Ø§Ù„Ù…Ù†ØªØ¬"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              >
                <option value="" disabled>Ø§Ø®ØªØ± Ø§Ù„ØªØµÙ†ÙŠÙâ€¦</option>
                {formCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox" checked={draft.isAvailable}
                onChange={(e) => setDraft({ ...draft, isAvailable: e.target.checked })}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="text-muted-foreground">Ù…ØªØ§Ø­ Ù„Ù„Ø·Ù„Ø¨</span>
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Ø§Ù„ÙˆØµÙ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span>
              <Input
                value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="ÙˆØµÙ Ù…Ø®ØªØµØ±" aria-label="ÙˆØµÙ Ø§Ù„Ù…Ù†ØªØ¬" maxLength={500}
              />
            </label>
            <div className="space-y-3 rounded-lg border border-primary/25 p-3 sm:col-span-2">
              <div><p className="font-medium">Ù…ØªØºÙŠØ±Ø§Øª Ø§Ù„Ù…Ù†ØªØ¬ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</p><p className="text-xs text-muted-foreground">Ø§Ø®ØªØ± Ø§Ù„Ø®ØµØ§Ø¦Øµ Ø«Ù… Ø£Ø¶Ù ÙƒÙ„ ØªÙƒÙˆÙŠÙ† Ø¨Ø³Ø¹Ø±Ù‡ Ø§Ù„Ù…Ø³ØªÙ‚Ù„. Ø§Ù„Ù…Ù†ØªØ¬ Ø§Ù„Ø¨Ø³ÙŠØ· ÙŠØ¨Ù‚Ù‰ ÙƒÙ…Ø§ Ù‡Ùˆ Ø¹Ù†Ø¯ ØªØ±Ùƒ Ù‡Ø°Ø§ Ø§Ù„Ù‚Ø³Ù… ÙØ§Ø±ØºÙ‹Ø§.</p></div>
              {variantAttributes.length === 0 ? <p className="text-sm text-muted-foreground">Ø£Ø¶Ù Ø®ØµØ§Ø¦Øµ ÙˆÙ‚ÙŠÙ…Ù‹Ø§ Ø£ÙˆÙ„Ù‹Ø§ Ù…Ù† Ù‚Ø³Ù… Â«Ø®ØµØ§Ø¦Øµ ÙˆÙ…ØªØºÙŠØ±Ø§Øª Ø§Ù„Ù…Ù†ØªØ¬Ø§ØªÂ» Ø£Ø³ÙÙ„ Ø§Ù„ØµÙØ­Ø©.</p> : <div className="flex flex-wrap gap-2">{variantAttributes.map((attribute) => <label key={attribute.id} className="flex items-center gap-2 rounded border px-2 py-1 text-sm"><input type="checkbox" checked={draft.attributeIds.includes(attribute.id)} onChange={(event) => setDraft((current) => ({ ...current, attributeIds: event.target.checked ? [...current.attributeIds, attribute.id] : current.attributeIds.filter((id) => id !== attribute.id), variants: [] }))} />{attribute.name}</label>)}</div>}
              {draft.attributeIds.length ? <Button size="sm" variant="outline" disabled={draft.attributeIds.some((id) => !(variantAttributes.find((attribute) => attribute.id === id)?.values.length))} onClick={() => setDraft((current) => ({ ...current, variants: [...current.variants, { valueIds: current.attributeIds.map((id) => variantAttributes.find((attribute) => attribute.id === id)?.values[0]?.id ?? ''), price: current.price, inventoryItemId: '' }] }))}><Icon name="plus" size={14} /> Ø¥Ø¶Ø§ÙØ© ØªÙƒÙˆÙŠÙ†</Button> : null}
              {draft.variants.map((variant, index) => <div key={index} className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_9rem_auto]"> <div className="grid gap-2 sm:grid-cols-2">{draft.attributeIds.map((attributeId) => { const attribute = variantAttributes.find((item) => item.id === attributeId); const valueIndex = draft.attributeIds.indexOf(attributeId); return <select key={attributeId} value={variant.valueIds[valueIndex] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex !== index ? item : { ...item, valueIds: item.valueIds.map((value, currentIndex) => currentIndex === valueIndex ? event.target.value : value) }) }))} className="h-10 rounded border bg-background px-2 text-sm"><option value="">{attribute?.name}</option>{attribute?.values.map((value) => <option key={value.id} value={value.id}>{attribute.name}: {value.label}</option>)}</select> })}</div><Input type="number" min="0.01" step="0.01" value={variant.price} onChange={(event) => setDraft((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item) }))} aria-label="Ø³Ø¹Ø± Ø§Ù„Ù…ØªØºÙŠØ±" /><Button size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, variants: current.variants.filter((_, itemIndex) => itemIndex !== index) }))}>Ø­Ø°Ù</Button></div>)}
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button size="sm" disabled={saving} onClick={saveProduct}>
                <Icon name="check" size={16} /> {saving ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø­ÙØ¸â€¦' : 'Ø­ÙØ¸'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
                Ø¥Ù„ØºØ§Ø¡
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      ) : null}

      {canCreateCategories ? (
        <Card>
          <CardHeader>
            <CardTitle>Ø§Ù„ØªØµÙ†ÙŠÙØ§Øª</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                placeholder="ØªØµÙ†ÙŠÙ Ø¬Ø¯ÙŠØ¯â€¦" aria-label="Ø§Ø³Ù… ØªØµÙ†ÙŠÙ Ø¬Ø¯ÙŠØ¯" maxLength={100} className="max-w-xs"
              />
              <Button size="sm" variant="outline" disabled={catBusy || !newCategory.trim() || (branches.length > 1 && !createBranchId)} onClick={addCategory}>
                <Icon name="plus" size={16} /> Ø¥Ø¶Ø§ÙØ©
              </Button>
            </div>
            {branches.length > 1 ? (
              <label className="flex max-w-xs flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Ø§Ù„ÙØ±Ø¹</span>
                <select value={createBranchId} onChange={(e) => setCreateBranchId(e.target.value)} aria-label="ÙØ±Ø¹ Ø§Ù„ØªØµÙ†ÙŠÙ"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
                  <option value="">Ø§Ø®ØªØ± Ø§Ù„ÙØ±Ø¹â€¦</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
            ) : null}
            {catalog.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØµÙ†ÙŠÙØ§Øª Ø¨Ø¹Ø¯.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {catalog.categories.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                    <span className="text-foreground">{c.name}</span>
                    <Badge tone="muted">{c.productsCount}</Badge>
                    {canManageCategories ? <button
                      type="button" onClick={() => deleteCategory(c.id)} disabled={catBusy}
                      aria-label={`Ø­Ø°Ù ØªØµÙ†ÙŠÙ ${c.name}`}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Icon name="trash" size={14} />
                    </button> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon="products" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù†ØªØ¬Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©" description="Ø¬Ø±Ù‘Ø¨ Ø¨Ø­Ø«Ø§Ù‹ Ø£Ùˆ ØªØµÙ†ÙŠÙØ§Ù‹ Ø¢Ø®Ø±." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <Card key={p.id} className={cn(!p.isAvailable && 'opacity-70')}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <CardTitle className="truncate text-base">{p.name}</CardTitle>
                  <span className="text-xs text-muted-foreground">{p.categoryName}</span>
                </div>
                <Badge tone={p.isAvailable ? 'success' : 'muted'}>
                  {p.isAvailable ? 'Ù…ØªØ§Ø­' : 'ØºÙŠØ± Ù…ØªØ§Ø­'}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <span className="text-base font-bold text-primary">{formatCurrency(Number(p.price))}</span>
                {canEdit || canToggle ? (
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <Button
                        size="sm" variant="ghost" onClick={() => openEdit(p)}
                        aria-label={`ØªØ¹Ø¯ÙŠÙ„ ${p.name}`}
                      >
                        <Icon name="settings" size={14} /> ØªØ¹Ø¯ÙŠÙ„
                      </Button>
                    ) : null}
                    {canToggle ? (
                      <Button
                        size="sm" variant="outline" disabled={pendingId === p.id}
                        onClick={() => toggle(p.id)}
                      >
                        <Icon name={p.isAvailable ? 'close' : 'check'} size={14} />
                        {pendingId === p.id ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø­ÙØ¸â€¦' : p.isAvailable ? 'Ø¥Ø®ÙØ§Ø¡' : 'Ø¥Ø¸Ù‡Ø§Ø±'}
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button size="sm" variant="ghost" disabled={archivingId === p.id} onClick={() => archiveProduct(p.id)}>
                        <Icon name="trash" size={14} /> {archivingId === p.id ? 'Archivingâ€¦' : 'Archive'}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}


