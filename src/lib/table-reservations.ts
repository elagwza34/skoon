import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import type { PrismaClient } from '@prisma/client'
import { staffCanAccessBranch } from '@/lib/session'

export class TableReservationError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message)
    this.name = 'TableReservationError'
  }
}

/** Default reservation TTL (10 minutes). Bounded by the `expires_at` column. */
export const DEFAULT_RESERVATION_TTL_SECONDS = 10 * 60

function isUniqueViolation(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === 'P2002' || code === '23505' || code === '23503'
}

function toReservationModel(row: {
  id: bigint

  tableId: bigint
  waiterId: string
  orderId: bigint | null
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  table?: { number: string | null } | null
}) {
  return {
    id: row.id.toString(),
    tableId: row.tableId.toString(),
    tableNumber: row.table?.number ?? null,
    waiterId: row.waiterId,
    orderId: row.orderId?.toString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Acquire a server-validated temporary reservation for a table. */
export async function acquireTableReservation(
  session: StaffSession,
  input: {
    tableId: string
    idempotencyKey?: string | null
    ttlSeconds?: number
  },
) {
  if (session.role !== ROLE.WAITER) throw new TableReservationError('Waiter access required', 403)
  const branchId = BigInt(session.branchId as string)
  const waiterId = session.id
  const ttlSeconds = Math.min(Math.max(input.ttlSeconds ?? 0, 1), 600)
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

  return prisma.$transaction(async (tx) => {
    // 1) Lock the table row so two waiters cannot claim the same seat
    //    concurrently. `FOR UPDATE` stops a second transaction from reading
    //    or writing the row until this transaction commits.
    const locked = await tx.$queryRaw<
      { id: bigint; branch_id: bigint; is_active: boolean }[]
    >`
      SELECT id, branch_id, is_active
      FROM cafe_tables
      WHERE id = ${BigInt(input.tableId)}
        AND branch_id = ${branchId}
        AND is_active = true
        AND deleted_at IS NULL
      FOR UPDATE
    `
    if (locked.length === 0) throw new TableReservationError('Table unavailable', 409)
    if (locked[0].branch_id !== branchId) throw new TableReservationError('Table unavailable', 409)

    // 2) Safety valve: reclaim reservations that expired while we waited.
    await tx.waiterTableReservation.deleteMany({
      where: { branchId, orderId: null, expiresAt: { lt: new Date() } },
    })

    // 3) Claim. The partial unique index `WHERE order_id IS NULL` makes this
    //    row-level safe: only one concurrent holder survives; the loser gets a
    //    unique-violation and must retry.
    let reserved
    try {
      reserved = await tx.waiterTableReservation.create({
        data: {
          branchId,
          tableId: BigInt(input.tableId),
          waiterId,
          orderId: null,
          expiresAt,
        },
        select: {
          id: true,
          tableId: true,
          waiterId: true,
          orderId: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          table: { select: { number: true } },
        },
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TableReservationError('Table is already reserved', 409)
      }
      throw error
    }

    if (input.idempotencyKey?.trim()) {
      await tx.financialOperation.create({
        data: {
          branchId,
          actorId: session.id,
          operationType: 'table_reservation_acquire',
          idempotencyKey: input.idempotencyKey.trim(),
          fingerprint: `${session.id}:${reserved.id}`,
          result: { tableId: reserved.tableId.toString(), expiresAt: reserved.expiresAt.toISOString() },
        },
      })
    }

    return toReservationModel(reserved)
  })
}

/** List live (unclaimed) reservations held by the current waiter. */
export async function listActiveReservations(session: StaffSession) {
  const branchId = BigInt(session.branchId as string)
  const rows = await prisma.waiterTableReservation.findMany({
    where: {
      branchId,
      waiterId: session.id,
      orderId: null,
      expiresAt: { gte: new Date() },
    },
    select: {
      id: true,
      tableId: true,
      waiterId: true,
      orderId: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      table: { select: { number: true, id: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({
    ...toReservationModel(r),
    tableNumber: r.table.number,
  }))
}

/** Release an acquired reservation (safe client-side abandon release). */
export async function releaseTableReservation(session: StaffSession, reservationId: string) {
  if (session.role !== ROLE.WAITER) throw new TableReservationError('Waiter access required', 403)
  const reservationIdBig = BigInt(reservationId)
  const branchId = BigInt(session.branchId as string)

  const row = await prisma.waiterTableReservation.findFirst({
    where: {
      id: reservationIdBig,
      branchId,
      waiterId: session.id,
      orderId: null,
    },
    select: { id: true, branchId: true },
  })
  if (!row || row.branchId !== branchId) throw new TableReservationError('Reservation not found', 404)

  await prisma.waiterTableReservation.delete({ where: { id: reservationIdBig } })
}

/** Reclaim expired unclaimed reservations for a branch (safety valve). */
export async function cleanExpiredReservations(branchId: bigint) {
  await prisma.waiterTableReservation.deleteMany({
    where: { branchId, orderId: null, expiresAt: { lt: new Date() } },
  })
}

/** Plain (non-locking) read used only to resolve the table id for idempotency
 *  fingerprinting. It validates ownership/branch/liveness but the authoritative
 *  check happens inside the transaction. Non-authoritative. */
export async function readReservationTableId(session: StaffSession, reservationId: string): Promise<bigint> {
  if (session.role !== ROLE.WAITER) throw new TableReservationError('Waiter access required', 403)
  const branchId = BigInt(session.branchId as string)
  const row = await prisma.waiterTableReservation.findFirst({
    where: {
      id: BigInt(reservationId),
      branchId,
      waiterId: session.id,
      orderId: null,
      expiresAt: { gte: new Date() },
    },
    select: { tableId: true },
  })
  if (!row) throw new TableReservationError('Reservation is expired, claimed, or not yours', 409)
  return row.tableId
}

/** Authoritative, row-locked validation inside an existing transaction.
 *  Returns the reserved table id. Caller must finalize order_id after creating
 *  the order in the same transaction. */
export async function validateAndClaimWaiterReservationTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  waiterId: string,
  branchId: bigint,
  reservationId: string,
): Promise<bigint> {
  const reservationIdBig = BigInt(reservationId)
  const rows = await tx.$queryRaw<{ id: bigint; table_id: bigint; expires_at: Date; order_id: bigint | null; waiter_id: string }[]>`
    SELECT id, table_id, expires_at, order_id, waiter_id
    FROM waiter_table_reservations
    WHERE id = ${reservationIdBig}
      AND waiter_id = ${waiterId}
      AND branch_id = ${branchId}
      AND order_id IS NULL
      AND expires_at >= now()
    FOR UPDATE
  `
  const row = rows[0]
  if (!row) throw new TableReservationError('Reservation is expired, claimed, or not yours', 409)
  return row.table_id
}

/** Finalize a reservation by attaching the confirmed order id. Idempotent: only
 *  attaches while order_id is still NULL. */
export async function finalizeReservationTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  reservationId: string,
  orderId: bigint,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE waiter_table_reservations
    SET order_id = ${orderId}, updated_at = now()
    WHERE id = ${BigInt(reservationId)} AND order_id IS NULL
  `
}
