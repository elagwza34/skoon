import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { getModifierConfiguration, mutateModifierConfiguration } from '@/lib/staff-product-modifiers'
import { CatalogError } from '@/lib/staff-catalog'

export const dynamic = 'force-dynamic'
function fail(error: unknown) { return error instanceof CatalogError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'تعذر حفظ إعدادات الإضافات.' }, { status: 500 }) }
export async function GET(request: Request) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { return NextResponse.json(await getModifierConfiguration(session, new URL(request.url).searchParams.get('branchId') ?? undefined)) } catch (error) { return fail(error) } }
export async function POST(request: Request) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { return NextResponse.json(await mutateModifierConfiguration(session, await request.json())) } catch (error) { return fail(error) } }
