'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Attribute = { id: string; name: string; description: string | null; isActive: boolean; values: { id: string; label: string; isActive: boolean }[] }
type Unit = { id: string; name: string; symbol: string; dimension: string; isActive: boolean }

export function ProductConfigurationBoard({ branches }: { branches: { id: string; name: string }[] }) {
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributeName, setAttributeName] = useState('')
  const [valueAttributeId, setValueAttributeId] = useState('')
  const [valueLabel, setValueLabel] = useState('')
  const [unitName, setUnitName] = useState('')
  const [unitSymbol, setUnitSymbol] = useState('')
  const [unitDimension, setUnitDimension] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : '')

  const canCreateValue = useMemo(() => Boolean(valueAttributeId && valueLabel.trim()), [valueAttributeId, valueLabel])
  async function load(targetBranchId = branchId) {
    if (!targetBranchId) { setAttributes([]); setUnits([]); return }
    const response = await fetch(`/api/staff/product-configuration?branchId=${encodeURIComponent(targetBranchId)}`, { cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error ?? 'تعذر تحميل إعدادات المتغيرات.')
    setAttributes(body.attributes ?? [])
    setUnits(body.units ?? [])
    setValueAttributeId((current) => current || body.attributes?.[0]?.id || '')
  }
  // `load` is intentionally invoked for branch selection changes only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'تعذر تحميل إعدادات المتغيرات.')) }, [branchId])
  async function create(body: Record<string, string>) {
    setBusy(true); setError(null); setSuccess(null)
    try {
      const response = await fetch('/api/staff/product-configuration', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'تعذر الحفظ.')
      await load(); setSuccess('تم الحفظ بنجاح.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر الحفظ.') }
    finally { setBusy(false) }
  }

  return <Card dir="rtl">
    <CardHeader><CardTitle>خصائص ومتغيرات المنتجات</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <p className="text-sm text-muted-foreground">أنشئ الخاصية وقيمها أولًا، مثل «الحجم: صغير، كبير». بعدها ستظهر في إعداد المنتج المتغير.</p>
      <label className="flex max-w-md flex-col gap-1 text-sm"><span className="text-muted-foreground">الفرع الذي تُدار خصائصه</span><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setError(null); setSuccess(null); setValueAttributeId('') }} className="h-10 rounded border bg-background px-3"><option value="">اختر الفرع أولًا…</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      {error ? <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="rounded bg-success/10 p-3 text-sm text-success">{success}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="font-medium">خاصية جديدة</h3>
          <Input value={attributeName} onChange={(event) => setAttributeName(event.target.value)} placeholder="مثال: الحجم" maxLength={100} />
          <Button size="sm" disabled={busy || !branchId || !attributeName.trim()} onClick={() => void create({ kind: 'attribute', branchId, name: attributeName.trim() }).then(() => setAttributeName(''))}>إضافة خاصية</Button>
        </section>
        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="font-medium">قيمة خاصية</h3>
          <select className="h-10 w-full rounded border bg-background px-3 text-sm" value={valueAttributeId} onChange={(event) => setValueAttributeId(event.target.value)}>
            <option value="">اختر الخاصية</option>{attributes.map((attribute) => <option key={attribute.id} value={attribute.id}>{attribute.name}</option>)}
          </select>
          <Input value={valueLabel} onChange={(event) => setValueLabel(event.target.value)} placeholder="مثال: كبير" maxLength={100} />
          <Button size="sm" disabled={busy || !branchId || !canCreateValue} onClick={() => void create({ kind: 'value', attributeId: valueAttributeId, label: valueLabel.trim() }).then(() => setValueLabel(''))}>إضافة قيمة</Button>
        </section>
        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="font-medium">وحدة قياس</h3>
          <Input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="مثال: جرام" maxLength={100} />
          <div className="grid grid-cols-2 gap-2"><Input value={unitSymbol} onChange={(event) => setUnitSymbol(event.target.value)} placeholder="g" maxLength={20} /><Input value={unitDimension} onChange={(event) => setUnitDimension(event.target.value)} placeholder="mass" maxLength={30} /></div>
          <Button size="sm" disabled={busy || !branchId || !unitName.trim() || !unitSymbol.trim() || !unitDimension.trim()} onClick={() => void create({ kind: 'unit', branchId, name: unitName.trim(), symbol: unitSymbol.trim(), dimension: unitDimension.trim() }).then(() => { setUnitName(''); setUnitSymbol(''); setUnitDimension('') })}>إضافة وحدة</Button>
        </section>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section><h3 className="mb-2 font-medium">الخصائص المتاحة</h3><div className="space-y-2">{attributes.length ? attributes.map((attribute) => <div key={attribute.id} className="rounded border p-3"><b>{attribute.name}</b><p className="mt-1 text-sm text-muted-foreground">{attribute.values.length ? attribute.values.map((value) => value.label).join('، ') : 'لا توجد قيم بعد.'}</p></div>) : <p className="text-sm text-muted-foreground">لا توجد خصائص بعد.</p>}</div></section>
        <section><h3 className="mb-2 font-medium">وحدات القياس</h3><div className="space-y-2">{units.length ? units.map((unit) => <div key={unit.id} className="rounded border p-3"><b>{unit.name}</b><span className="mx-2 text-muted-foreground">{unit.symbol}</span><span className="text-xs text-muted-foreground">{unit.dimension}</span></div>) : <p className="text-sm text-muted-foreground">لا توجد وحدات بعد.</p>}</div></section>
      </div>
    </CardContent>
  </Card>
}
