'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Group = {
  id: string
  name: string
  type: 'single' | 'multi'
  isRequired: boolean
  maxSelections: number
  isActive: boolean
  values: { id: string; value: string; priceAdjustment: string; isActive: boolean; sortOrder: number }[]
}
type Product = { id: string; name: string; groupIds: string[] }

export function ProductModifiersBoard({ branches }: { branches: { id: string; name: string }[] }) {
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : '')
  const [groups, setGroups] = useState<Group[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<'single' | 'multi'>('single')
  const [required, setRequired] = useState(false)
  const [maxSelections, setMaxSelections] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [optionDraft, setOptionDraft] = useState<Record<string, { label: string; price: string }>>({})

  async function load(target = branchId) {
    if (!target) { setGroups([]); setProducts([]); return }
    const response = await fetch(`/api/staff/product-modifiers?branchId=${target}`, { cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error ?? 'تعذر تحميل مجموعات الإضافات')
    setGroups(body.groups ?? [])
    setProducts(body.products ?? [])
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'تعذر التحميل')) }, [branchId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function mutate(body: Record<string, unknown>, okMessage?: string) {
    setBusy(true); setError(null); setSuccess(null)
    try {
      const response = await fetch('/api/staff/product-modifiers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'تعذر الحفظ')
      await load()
      if (okMessage) setSuccess(okMessage)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر الحفظ') }
    finally { setBusy(false) }
  }

  function addOption(group: Group) {
    const draft = optionDraft[group.id] ?? { label: '', price: '0' }
    const label = draft.label.trim()
    if (!label) { setError('اكتب اسم الخيار أولًا'); return }
    const priceAdjustment = Number(draft.price || '0')
    if (!Number.isFinite(priceAdjustment)) { setError('تعديل السعر غير صالح'); return }
    void mutate({ action: 'option.create', groupId: group.id, label, priceAdjustment, sortOrder: group.values.length }, 'تمت إضافة الخيار').then(() => {
      setOptionDraft((current) => ({ ...current, [group.id]: { label: '', price: '0' } }))
    })
  }

  const selectedTypeMax = type === 'single' ? 1 : Math.max(1, maxSelections)
  const canCreate = !!branchId && !!name.trim() && !busy

  return (
    <div dir="rtl" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>مجموعات الإضافات (Add-ons)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground space-y-1">
            <p><b className="text-foreground">الفكرة ببساطة:</b> مجموعة الإضافات ليست متغير سعر/حجم المنتج. هي خيارات تُسأل عنها أثناء الطلب مثل «درجة السكر»، «نوع الحليب»، «إضافة صوص».</p>
            <p><b className="text-foreground">الخطوات:</b> 1) اختر الفرع. 2) أنشئ مجموعة. 3) أضف خياراتها مع تعديل السعر إن وجد. 4) فعّل المجموعة للمنتجات المناسبة بأسفل كل مجموعة.</p>
          </div>

          <label className="flex max-w-md flex-col gap-1 text-sm">
            <span className="text-muted-foreground">الفرع</span>
            <select className="h-10 rounded border bg-background px-3" value={branchId} onChange={(event) => { setBranchId(event.target.value); setError(null); setSuccess(null) }}>
              <option value="">اختر الفرع أولًا…</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>

          {error ? <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          {success ? <p className="rounded bg-success/10 p-3 text-sm text-success">{success}</p> : null}

          <section className="rounded-xl border p-4 space-y-3">
            <p className="font-semibold">1) إنشاء مجموعة جديدة</p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">اسم المجموعة</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: درجة السكر / إضافات / نوع الحليب" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">نوع الاختيار</span>
                <select className="h-10 rounded border bg-background px-3" value={type} onChange={(event) => { const next = event.target.value as 'single' | 'multi'; setType(next); if (next === 'single') setMaxSelections(1) }}>
                  <option value="single">اختيار واحد فقط (مثل: سكر/بدون سكر)</option>
                  <option value="multi">اختيارات متعددة (مثل: إضافات متعددة)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">أقصى عدد اختيارات</span>
                <Input type="number" min={1} max={20} value={String(selectedTypeMax)} disabled={type === 'single'} onChange={(event) => setMaxSelections(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} className="h-4 w-4" />
                <span>إلزامية للعميل</span>
              </label>
            </div>
            <Button disabled={!canCreate} onClick={() => void mutate({ action: 'group.create', branchId, name: name.trim(), type, isRequired: required, minSelections: required ? 1 : 0, maxSelections: selectedTypeMax }, 'تم إنشاء المجموعة').then(() => { setName(''); setRequired(false); setType('single'); setMaxSelections(1) })}>إضافة مجموعة</Button>
          </section>
        </CardContent>
      </Card>

      {!branchId ? <p className="text-sm text-muted-foreground">اختر فرعًا لعرض المجموعات والمنتجات.</p> : null}
      {branchId && groups.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد مجموعات إضافات لهذا الفرع بعد.</p> : null}

      {groups.map((group) => {
        const draft = optionDraft[group.id] ?? { label: '', price: '0' }
        const assignedCount = products.filter((product) => product.groupIds.includes(group.id)).length
        return (
          <Card key={group.id} className={!group.isActive ? 'opacity-70' : ''}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {group.name}
                    <span className={`rounded px-2 py-0.5 text-xs font-normal ${group.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{group.isActive ? 'مفعّلة' : 'معطلة'}</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {group.type === 'single' ? 'اختيار واحد' : `حتى ${group.maxSelections} اختيارات`} · {group.isRequired ? 'إلزامية' : 'اختيارية'} · {group.values.length} خيار · مرتبطة بـ {assignedCount} منتج
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { const value = window.prompt('اسم المجموعة', group.name)?.trim(); if (value && value !== group.name) void mutate({ action: 'group.update', id: group.id, name: value }, 'تم تحديث الاسم') }}>إعادة تسمية</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void mutate({ action: 'group.update', id: group.id, isActive: !group.isActive }, group.isActive ? 'تم تعطيل المجموعة' : 'تم تفعيل المجموعة')}>{group.isActive ? 'تعطيل' : 'تفعيل'}</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <section className="space-y-2">
                <p className="font-medium text-sm">2) خيارات المجموعة</p>
                <div className="grid gap-2 md:grid-cols-[1fr_10rem_auto]">
                  <Input value={draft.label} onChange={(e) => setOptionDraft((current) => ({ ...current, [group.id]: { ...(current[group.id] ?? { label: '', price: '0' }), label: e.target.value } }))} placeholder="اسم الخيار، مثال: حليب لوز / زيادة شوت / سكر خفيف" />
                  <Input type="number" step="0.01" value={draft.price} onChange={(e) => setOptionDraft((current) => ({ ...current, [group.id]: { ...(current[group.id] ?? { label: '', price: '0' }), price: e.target.value } }))} aria-label="تعديل السعر" placeholder="تعديل السعر" />
                  <Button disabled={busy || !draft.label.trim()} onClick={() => addOption(group)}>إضافة خيار</Button>
                </div>
                <p className="text-xs text-muted-foreground">تعديل السعر: 0 بدون زيادة، رقم موجب = زيادة على سعر المنتج، رقم سالب = خصم (إن كان مدعومًا في التسعير).</p>

                <div className="space-y-2">
                  {group.values.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد خيارات بعد.</p> : group.values.map((option, index) => (
                    <div key={option.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{option.value}</p>
                        <p className="text-xs text-muted-foreground">تعديل السعر: {option.priceAdjustment} ج.م · {option.isActive ? 'مفعّل' : 'معطّل'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const value = window.prompt('اسم الخيار', option.value)?.trim(); if (value && value !== option.value) void mutate({ action: 'option.update', id: option.id, label: value }) }}>تعديل الاسم</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const price = window.prompt('تعديل السعر بالجنيه', option.priceAdjustment)?.trim(); if (price !== undefined && price !== option.priceAdjustment) void mutate({ action: 'option.update', id: option.id, priceAdjustment: Number(price) }) }}>تعديل السعر</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mutate({ action: 'option.update', id: option.id, isActive: !option.isActive })}>{option.isActive ? 'تعطيل' : 'تفعيل'}</Button>
                        <Button size="sm" variant="ghost" disabled={busy || index === 0} onClick={() => void mutate({ action: 'option.update', id: option.id, sortOrder: Math.max(0, option.sortOrder - 1) })}>↑</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2 border-t pt-3">
                <p className="font-medium text-sm">3) المنتجات التي تظهر لها هذه المجموعة</p>
                <p className="text-xs text-muted-foreground">فعّل المجموعة فقط للمنتجات المناسبة (مثلاً: «درجة السكر» للمشروبات). عند إسنادها للمنتج سيظهر للعميل/الويتر أثناء الطلب حسب إعدادات المجموعة.</p>
                {products.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد منتجات في هذا الفرع.</p> : (
                  <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto rounded border p-2">
                    {products.map((product) => {
                      const checked = product.groupIds.includes(group.id)
                      return (
                        <label key={product.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm cursor-pointer ${checked ? 'border-primary bg-primary/5' : ''}`}>
                          <input type="checkbox" checked={checked} disabled={busy} onChange={() => void mutate({ action: 'assignment.set', productId: product.id, groupIds: checked ? product.groupIds.filter((id) => id !== group.id) : [...product.groupIds, group.id] })} />
                          {product.name}
                        </label>
                      )
                    })}
                  </div>
                )}
              </section>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}