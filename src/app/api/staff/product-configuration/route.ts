import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { CatalogError } from '@/lib/staff-catalog'
import { createProductConfiguration, getProductConfiguration } from '@/lib/product-configuration'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const branchId = new URL(request.url).searchParams.get('branchId') ?? undefined
  try { return NextResponse.json(await getProductConfiguration(session, branchId)) }
  catch (error) { return NextResponse.json({ error: error instanceof CatalogError ? error.message : 'تعذر تحميل إعدادات المنتج.' }, { status: error instanceof CatalogError ? error.status : 500 }) }
}

export async function POST(request: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json(await createProductConfiguration(session, await request.json()), { status: 201 }) }
  catch (error) { return NextResponse.json({ error: error instanceof CatalogError ? error.message : 'تعذر حفظ الإعداد.' }, { status: error instanceof CatalogError ? error.status : 500 }) }
}
