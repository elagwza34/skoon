import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { acceptCashHandover, disputeCashHandover, resolveCashHandover, getPendingHandovers, cashHandoverActionSchema, ShiftError } from '@/lib/staff-shifts'

export const dynamic = 'force-dynamic'

/** Recipient confirmation requires confirmed:true and an explicit count.
 * reject is a non-posting dispute. Path id is the originating shift id. */
export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const search = new URL(req.url).searchParams
  try {
    return NextResponse.json({ handovers: await getPendingHandovers(session, search.get('branchId') ?? undefined, search.get('toCashierId') ?? undefined, search.get('status') ?? 'PENDING') })
  } catch (error) {
    if (error instanceof ShiftError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'تعذر جلب التسليمات' }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const parsed = cashHandoverActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'التأكيد الصريح والمبلغ والبيانات الصحيحة مطلوبة' }, { status: 400 })
  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'وردية غير صالحة' }, { status: 400 })
  const body = parsed.data
  const context = { confirmed: body.confirmed, fromShiftId: id, branchId: body.branchId }
  try {
    const result = body.action === 'accept'
      ? await acceptCashHandover(session, body.handoverId, body.countedAmount, context)
      : body.action === 'resolve'
        ? await resolveCashHandover(session, body.handoverId, body.resolvedAmount, body.resolutionNote, context)
        : await disputeCashHandover(session, body.handoverId, body.disputeReason, body.countedAmount, context)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ShiftError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'فشلت عملية تسليم النقد' }, { status: 500 })
  }
}
