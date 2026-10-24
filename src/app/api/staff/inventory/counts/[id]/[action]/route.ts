import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { StockCountError, startStockCount, saveStockCountLines, submitStockCount, previewStockCountVariances, postStockCount, cancelStockCount } from '@/lib/staff-stock-count-write'
import { unauthenticatedStaffResponse } from '@/lib/api-auth-response'

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const session = await getStaffSession(); if (!session) return unauthenticatedStaffResponse()
  const { id, action } = await params
  try {
    const body = await request.json().catch(() => ({}))
    let result: unknown
    if (action === 'start') result = await startStockCount(session, id)
    else if (action === 'lines') result = await saveStockCountLines(session, id, body.lines)
    else if (action === 'submit') result = await submitStockCount(session, id)
    else if (action === 'preview') result = await previewStockCountVariances(session, id)
    else if (action === 'post') result = await postStockCount(session, id)
    else if (action === 'cancel') result = await cancelStockCount(session, id, String(body.reason ?? ''))
    else return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 404 })
    return NextResponse.json({ result: JSON.parse(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value)) })
  } catch (error) { const e = error instanceof StockCountError ? error : null; return NextResponse.json({ error: e?.message ?? 'فشل الإجراء' }, { status: e?.status ?? 400 }) }
}
