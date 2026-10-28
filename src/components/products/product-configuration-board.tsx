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
    if (!response.ok) throw new Error(body.error ?? 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…ØªØºÙŠØ±Ø§Øª.')
    setAttributes(body.attributes ?? [])
    setUnits(body.units ?? [])
    setValueAttributeId((current) => current || body.attributes?.[0]?.id || '')
  }
  // `load` is intentionally invoked for branch selection changes only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…ØªØºÙŠØ±Ø§Øª.')) }, [branchId])
  async function create(body: Record<string, string>) {
    setBusy(true); setError(null); setSuccess(null)
    try {
      const response = await fetch('/api/staff/product-configuration', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'ØªØ¹Ø°Ø± Ø§Ù„Ø­ÙØ¸.')
      await load(); setSuccess('ØªÙ… Ø§Ù„Ø­ÙØ¸ Ø¨Ù†Ø¬Ø§Ø­.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø§Ù„Ø­ÙØ¸.') }
    finally { setBusy(false) }
  }

  return <Card dir="rtl">
    <CardHeader><CardTitle>Ø®ØµØ§Ø¦Øµ ÙˆÙ…ØªØºÙŠØ±Ø§Øª Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <p className="text-sm text-muted-foreground">Ø£Ù†Ø´Ø¦ Ø§Ù„Ø®Ø§ØµÙŠØ© ÙˆÙ‚ÙŠÙ…Ù‡Ø§ Ø£ÙˆÙ„Ù‹Ø§ØŒ Ù…Ø«Ù„ Â«Ø§Ù„Ø­Ø¬Ù…: ØµØºÙŠØ±ØŒ ÙƒØ¨ÙŠØ±Â». Ø¨Ø¹Ø¯Ù‡Ø§ Ø³ØªØ¸Ù‡Ø± ÙÙŠ Ø¥Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ù…Ù†ØªØ¬ Ø§Ù„Ù…ØªØºÙŠØ±.</p>
      <label className="flex max-w-md flex-col gap-1 text-sm"><span className="text-muted-foreground">Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø°ÙŠ ØªÙØ¯Ø§Ø± Ø®ØµØ§Ø¦ØµÙ‡</span><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setError(null); setSuccess(null); setValueAttributeId('') }} className="h-10 rounded border bg-background px-3"><option value="">Ø§Ø®ØªØ± Ø§Ù„ÙØ±Ø¹ Ø£ÙˆÙ„Ù‹Ø§â€¦</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      {error ? <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="rounded bg-success/10 p-3 text-sm text-success">{success}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="font-medium">Ø®Ø§ØµÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©</h3>
          <Input value={attributeName} onChange={(event) => setAttributeName(event.target.value)} placeholder="Ù…Ø«Ø§Ù„: Ø§Ù„Ø­Ø¬Ù…" maxLength={100} />
          <Button size="sm" disabled={busy || !branchId || !attributeName.trim()} onClick={() => void create({ kind: 'attribute', branchId, name: attributeName.trim() }).then(() => setAttributeName(''))}>Ø¥Ø¶Ø§ÙØ© Ø®Ø§ØµÙŠØ©</Button>
        </section>
        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="font-medium">Ù‚ÙŠÙ…Ø© Ø®Ø§ØµÙŠØ©</h3>
          <select className="h-10 w-full rounded border bg-background px-3 text-sm" value={valueAttributeId} onChange={(event) => setValueAttributeId(event.target.value)}>
            <option value="">Ø§Ø®ØªØ± Ø§Ù„Ø®Ø§ØµÙŠØ©</option>{attributes.map((attribute) => <option key={attribute.id} value={attribute.id}>{attribute.name}</option>)}
          </select>
          <Input value={valueLabel} onChange={(event) => setValueLabel(event.target.value)} placeholder="Ù…Ø«Ø§Ù„: ÙƒØ¨ÙŠØ±" maxLength={100} />
          <Button size="sm" disabled={busy || !branchId || !canCreateValue} onClick={() => void create({ kind: 'value', attributeId: valueAttributeId, label: valueLabel.trim() }).then(() => setValueLabel(''))}>Ø¥Ø¶Ø§ÙØ© Ù‚ÙŠÙ…Ø©</Button>
        </section>
        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="font-medium">ÙˆØ­Ø¯Ø© Ù‚ÙŠØ§Ø³</h3>
          <Input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Ù…Ø«Ø§Ù„: Ø¬Ø±Ø§Ù…" maxLength={100} />
          <div className="grid grid-cols-2 gap-2"><Input value={unitSymbol} onChange={(event) => setUnitSymbol(event.target.value)} placeholder="g" maxLength={20} /><Input value={unitDimension} onChange={(event) => setUnitDimension(event.target.value)} placeholder="mass" maxLength={30} /></div>
          <Button size="sm" disabled={busy || !branchId || !unitName.trim() || !unitSymbol.trim() || !unitDimension.trim()} onClick={() => void create({ kind: 'unit', branchId, name: unitName.trim(), symbol: unitSymbol.trim(), dimension: unitDimension.trim() }).then(() => { setUnitName(''); setUnitSymbol(''); setUnitDimension('') })}>Ø¥Ø¶Ø§ÙØ© ÙˆØ­Ø¯Ø©</Button>
        </section>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section><h3 className="mb-2 font-medium">Ø§Ù„Ø®ØµØ§Ø¦Øµ Ø§Ù„Ù…ØªØ§Ø­Ø©</h3><div className="space-y-2">{attributes.length ? attributes.map((attribute) => <div key={attribute.id} className="rounded border p-3"><b>{attribute.name}</b><p className="mt-1 text-sm text-muted-foreground">{attribute.values.length ? attribute.values.map((value) => value.label).join('ØŒ ') : 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù‚ÙŠÙ… Ø¨Ø¹Ø¯.'}</p></div>) : <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø®ØµØ§Ø¦Øµ Ø¨Ø¹Ø¯.</p>}</div></section>
        <section><h3 className="mb-2 font-medium">ÙˆØ­Ø¯Ø§Øª Ø§Ù„Ù‚ÙŠØ§Ø³</h3><div className="space-y-2">{units.length ? units.map((unit) => <div key={unit.id} className="rounded border p-3"><b>{unit.name}</b><span className="mx-2 text-muted-foreground">{unit.symbol}</span><span className="text-xs text-muted-foreground">{unit.dimension}</span></div>) : <p className="text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ­Ø¯Ø§Øª Ø¨Ø¹Ø¯.</p>}</div></section>
      </div>
    </CardContent>
  </Card>
}


