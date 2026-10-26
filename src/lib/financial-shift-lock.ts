import type { Prisma } from '@prisma/client'

/**
 * Transaction-scoped coordination for a single till session.
 *
 * Lock order for every writer that can change a shift's physical cash is:
 *   1. this advisory lock, keyed by shift id;
 *   2. the shift row FOR UPDATE;
 *   3. any order row FOR UPDATE (payments only).
 *
 * The advisory lock makes the order independent of which rows a mutation needs
 * to inspect.  It is released automatically on commit or rollback.
 */
export type FinancialTransaction = Prisma.TransactionClient

export class FinancialShiftLockError extends Error {
  readonly status = 409

  constructor() {
    super('تعذر تنفيذ العملية المالية لأن الوردية قيد الإقفال. أعد المحاولة.')
    this.name = 'FinancialShiftLockError'
  }
}

/** Pure and testable: all writers must use exactly this lock namespace. */
export function financialShiftLockName(shiftId: bigint | string): string {
  return `shift-financial:${shiftId.toString()}`
}

function isLockTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (((error as { code?: unknown }).code === '55P03') || ((error as { code?: unknown }).code === '57014'))
}

/**
 * Acquire the common shift lock before reading or changing shift-linked money.
 * A short local timeout fails safely instead of leaving a request blocked behind
 * an abandoned/slow financial operation.
 */
export async function lockShiftFinancialState(tx: FinancialTransaction, shiftId: bigint): Promise<void> {
  try {
    // Static SQL only.  SET LOCAL automatically resets when this transaction ends.
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${financialShiftLockName(shiftId)}))`
  } catch (error) {
    if (isLockTimeout(error)) throw new FinancialShiftLockError()
    throw error
  }
}

export interface LockedOpenShift {
  id: bigint
  branchId: bigint
  cashierId: string | null
  status: string
}

/**
 * Re-check an externally observed open shift only after its common lock is
 * held.  Callers may use a pre-transaction lookup solely to obtain the stable
 * lock key; that lookup is never authorization to write.
 */
export async function lockAndReadShift(tx: FinancialTransaction, shiftId: bigint): Promise<LockedOpenShift | null> {
  await lockShiftFinancialState(tx, shiftId)
  const rows = await tx.$queryRaw<LockedOpenShift[]>`
    SELECT id, branch_id AS "branchId", cashier_id AS "cashierId", status
    FROM shifts
    WHERE id = ${shiftId}
    FOR UPDATE
  `
  return rows[0] ?? null
}
