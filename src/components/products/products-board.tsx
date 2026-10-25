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
 * Products board — real branch catalog from the DB.
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
}

const EMPTY_DRAFT: ProductDraft = { name: '', description: '', price: '', categoryId: '', isAvailable: true, taxRate: '0', inventoryItemId: '' }

export function ProductsBoard({
  catalog,
  canEdit,
  canToggle,
  canManageCategories = false,
  branches = [],
}: {
  catalog: StaffCatalog
  canEdit: boolean
  canToggle?: boolean
  canManageCategories?: boolean
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
  const [createBranchId, setCreateBranchId] = useState(branches[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  // Category management state (owner/manager)
  const [newCategory, setNewCategory] = useState('')
  const [catBusy, setCatBusy] = useState(false)

  const options = useMemo(
    () => [
      { value: 'all', label: 'الكل' },
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

  async function toggle(id: string) {
    setPendingId(id)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/staff/products/${id}/toggle`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'فشل التحديث')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحديث')
    } finally {
      setPendingId(null)
    }
  }

  function openCreate() {
    setError(null)
    setSuccess(null)
    const initialBranchId = branches[0]?.id ?? ''
    const initialCategory = initialBranchId
      ? catalog.categories.find((item) => item.branchId === initialBranchId)
      : catalog.categories[0]
    setCreateBranchId(initialBranchId)
    setDraft({ ...EMPTY_DRAFT, categoryId: initialCategory?.id ?? '' })
    setShowForm(true)
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
    })
    setShowForm(true)
  }

  async function saveProduct() {
    if (saving) return
    const priceNum = Number(draft.price)
    const taxRate = Number(draft.taxRate || '0')
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('السعر يجب أن يكون رقماً موجباً')
      return
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setError('Tax rate must be between 0 and 100')
      return
    }
    if (!draft.categoryId) {
      setError('اختر التصنيف')
      return
    }
    if (!draft.id && branches.length > 0 && !createBranchId) {
      setError('اختر الفرع')
      return
    }
    if (!draft.name.trim()) {
      setError('اسم المنتج مطلوب')
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
        ...(isEdit ? {} : { branchId: createBranchId }),
      }
      const res = await fetch(isEdit ? `/api/staff/products/${draft.id}` : '/api/staff/products', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'فشل الحفظ')
      setShowForm(false)
      setSuccess(isEdit ? 'تم تحديث المنتج' : 'تم إضافة المنتج')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const formCategories = draft.id || !createBranchId
    ? catalog.categories
    : catalog.categories.filter((item) => item.branchId === createBranchId)
  const formInventoryItems = draft.id || !createBranchId
    ? catalog.inventoryItems
    : catalog.inventoryItems.filter((item) => item.branchId === createBranchId)

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
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'فشل إضافة التصنيف')
      setNewCategory('')
      setSuccess('تم إضافة التصنيف')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إضافة التصنيف')
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
      if (!res.ok) throw new Error(data?.error ?? 'فشل حذف التصنيف')
      setSuccess('تم حذف التصنيف')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل حذف التصنيف')
    } finally {
      setCatBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن منتج…" aria-label="بحث المنتجات" className="max-w-xs"
        />
        <Segmented options={options} value={category} onChange={setCategory} ariaLabel="تصفية التصنيف" />
        {canEdit ? (
          <Button size="sm" className="ms-auto" onClick={openCreate}>
            <Icon name="plus" size={16} /> منتج جديد
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
            <CardTitle>{draft.id ? 'تعديل منتج' : 'منتج جديد'}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">الاسم</span>
              <Input
                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="اسم المنتج" aria-label="اسم المنتج" maxLength={150}
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
            {!draft.id && branches.length > 0 ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">الفرع</span>
                <select
                  value={createBranchId}
                  onChange={(e) => {
                    const branchId = e.target.value
                    const firstCategory = catalog.categories.find((item) => item.branchId === branchId)
                    setCreateBranchId(branchId)
                    setDraft((current) => ({ ...current, categoryId: firstCategory?.id ?? '', inventoryItemId: '' }))
                  }}
                  aria-label="فرع المنتج"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <option value="">اختر الفرع…</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">السعر (ج.م)</span>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                placeholder="0.00" aria-label="سعر المنتج"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">التصنيف</span>
              <select
                value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                aria-label="تصنيف المنتج"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              >
                <option value="" disabled>اختر التصنيف…</option>
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
              <span className="text-muted-foreground">متاح للطلب</span>
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">الوصف (اختياري)</span>
              <Input
                value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="وصف مختصر" aria-label="وصف المنتج" maxLength={500}
              />
            </label>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button size="sm" disabled={saving} onClick={saveProduct}>
                <Icon name="check" size={16} /> {saving ? 'جاري الحفظ…' : 'حفظ'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      ) : null}

      {canManageCategories ? (
        <Card>
          <CardHeader>
            <CardTitle>التصنيفات</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                placeholder="تصنيف جديد…" aria-label="اسم تصنيف جديد" maxLength={100} className="max-w-xs"
              />
              <Button size="sm" variant="outline" disabled={catBusy || !newCategory.trim()} onClick={addCategory}>
                <Icon name="plus" size={16} /> إضافة
              </Button>
            </div>
            {catalog.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد تصنيفات بعد.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {catalog.categories.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                    <span className="text-foreground">{c.name}</span>
                    <Badge tone="muted">{c.productsCount}</Badge>
                    <button
                      type="button" onClick={() => deleteCategory(c.id)} disabled={catBusy}
                      aria-label={`حذف تصنيف ${c.name}`}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon="products" title="لا توجد منتجات مطابقة" description="جرّب بحثاً أو تصنيفاً آخر." />
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
                  {p.isAvailable ? 'متاح' : 'غير متاح'}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <span className="text-base font-bold text-primary">{formatCurrency(Number(p.price))}</span>
                {canEdit || canToggle ? (
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <Button
                        size="sm" variant="ghost" onClick={() => openEdit(p)}
                        aria-label={`تعديل ${p.name}`}
                      >
                        <Icon name="settings" size={14} /> تعديل
                      </Button>
                    ) : null}
                    {canToggle ? (
                      <Button
                        size="sm" variant="outline" disabled={pendingId === p.id}
                        onClick={() => toggle(p.id)}
                      >
                        <Icon name={p.isAvailable ? 'close' : 'check'} size={14} />
                        {pendingId === p.id ? 'جاري الحفظ…' : p.isAvailable ? 'إخفاء' : 'إظهار'}
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button size="sm" variant="ghost" disabled={archivingId === p.id} onClick={() => archiveProduct(p.id)}>
                        <Icon name="trash" size={14} /> {archivingId === p.id ? 'Archiving…' : 'Archive'}
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
