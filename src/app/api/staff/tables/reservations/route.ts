import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ROLE } from '@/lib/authz'
import { staffCanAccessBranch } from '@/lib/session'
import { getStaffSession } from '@/lib/session'
import {
  acquireTableReservation,
  listActiveReservations,
  releaseTableReservation,
  cleanExpiredReservations,
  TableReservationError,
} from '@/lib/table-reservations'

const id = z.string().regex(/^\d+$/, 'Invalid id')
const reservationId = z.string().regex(/^\d+$/, 'Invalid reservation id')

const acquireSchema = z.object({
  tableId: id,
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  ttlSeconds: z.number().int().min(1).max(600).optional(),
})

function tableReservationResponse(reservation: { id: string; tableNumber: string | null; expiresAt: string; orderId: string | null }) {
  return NextResponse.json({
    reservation: {
      id: reservation.id,
      tableNumber: reservation.tableNumber,
      expiresAt: reservation.expiresAt,
      orderId: reservation.orderId,
    },
  })
}

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.WAITER) return NextResponse.json({ error: 'Waiter access required' }, { status: 403 })
  if (!staffCanAccessBranch(session, BigInt(session.branchId as string))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const reservations = await listActiveReservations(session)
  return NextResponse.json({ reservations })
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.WAITER) return NextResponse.json({ error: 'Waiter access required' }, { status: 403 })
  const parsed = acquireSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid reservation payload' }, { status: 400 })
  }
  try {
    const reservation = await acquireTableReservation(session, parsed.data)
    return tableReservationResponse(reservation)
  } catch (error) {
    if (error instanceof TableReservationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Could not acquire table reservation' }, { status: 409 })
  }
}

export async function DELETE(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.WAITER) return NextResponse.json({ error: 'Waiter access required' }, { status: 403 })
  const reservationId = new URL(req.url).searchParams.get('id') ?? ''
  if (!reservationId || !reservationId.trim()) return NextResponse.json({ error: 'Invalid reservation id' }, { status: 400 })
  try {
    await releaseTableReservation(session, reservationId.trim())
    return NextResponse.json({ released: true })
  } catch (error) {
    if (error instanceof TableReservationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Could not release reservation' }, { status: 404 })
  }
}

// ---------------------------------------------------------------------------
// Host-side safety valve: called on session load and full-page reloads so
// abandoned drafts do not permanently block a seat.
// ---------------------------------------------------------------------------
export async function HEAD(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.WAITER) return NextResponse.json({ error: 'Waiter access required' }, { status: 403 })
  try {
    await cleanExpiredReservations(BigInt(session.branchId as string))
    return new NextResponse(null, { status: 200 })
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}
