'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Policy = { id: string; effectiveFrom: string; effectiveUntil?: string | null; employeeId?: string | null; roleId?: string | null; branchId?: string | null; regularMultiplier?: string | null; fixedHourlyRate?: string | null; graceMinutes: number }

/** Displays the effective-dated history returned by the protected overtime API.
 * The payroll generator remains the authoritative scope precedence resolver. */
export function OvertimePolicyHistory() {
  const [policies, setPolicies] = useState<Policy[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void (async () => { try { const response = await fetch('/api/staff/hr/overtime'); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to load overtime policies'); setPolicies(body.policies ?? []) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load overtime policies') } })() }, [])
  return <Card dir="rtl"><CardHeader><CardTitle>Ø³Ø¬Ù„ Ø³ÙŠØ§Ø³Ø§Øª Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ</CardTitle></CardHeader><CardContent>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<div className="overflow-auto"><table className="w-full text-sm"><thead className="text-start text-muted-foreground"><tr><th>Ø§Ù„Ø³Ø±ÙŠØ§Ù†</th><th>Ø§Ù„Ù†Ø·Ø§Ù‚</th><th>Ø§Ù„Ù…Ø¶Ø§Ø¹Ù</th><th>Ø³Ù…Ø§Ø­ Ø¨Ø§Ù„Ø¯Ù‚Ø§Ø¦Ù‚</th></tr></thead><tbody>{policies?.map((policy) => <tr key={policy.id} className="border-t"><td className="py-2">{String(policy.effectiveFrom).slice(0, 10)}{policy.effectiveUntil ? ` â€” ${String(policy.effectiveUntil).slice(0, 10)}` : ''}</td><td>{policy.employeeId ? 'Ù…ÙˆØ¸Ù' : policy.roleId ? 'Ø¯ÙˆØ±' : policy.branchId ? 'ÙØ±Ø¹' : 'Ø¹Ø§Ù…'}</td><td>{policy.fixedHourlyRate ?? policy.regularMultiplier ?? 'â€”'}</td><td>{policy.graceMinutes}</td></tr>)}</tbody></table>{policies?.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³ÙŠØ§Ø³Ø§Øª Ù…Ø³Ø¬Ù„Ø©.</p> : null}</div></CardContent></Card>
}


