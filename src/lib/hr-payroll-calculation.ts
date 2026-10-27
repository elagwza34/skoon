/** Pure, preview-safe payroll arithmetic. It cannot create payments or ledger rows. */
export type PayrollCompensation = { kind: 'monthly' | 'hourly'; cents: number; scheduledMinutes: number; payableMinutes: number }
export type PayrollOvertime = { approvedMinutes: number; multiplierBasisPoints: number; premiumOnly: boolean; hourlyRateCents?: number }
export type PayrollAdjustment = { type: 'bonus' | 'deduction' | 'penalty' | 'advance_repayment'; cents: number; approved: boolean }
export type PayrollCalculation = {
  baseCents: number; overtimeCents: number; bonusCents: number; deductionCents: number; advanceRecoveryCents: number; grossCents: number; netCents: number
  snapshot: { version: 1; compensation: PayrollCompensation; overtime: PayrollOvertime[]; adjustments: PayrollAdjustment[] }
}

function int(value: number, field: string) { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${field}`); return value }
function mulDivRound(value: number, numerator: number, denominator: number) {
  if (denominator <= 0) throw new Error('Invalid payroll divisor')
  const result = (BigInt(value) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator)
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Payroll amount exceeds safe range')
  return Number(result)
}

/**
 * Monthly compensation is prorated against contractual minutes in the actual
 * covered period. A missing contractual basis fails closed rather than guessing.
 */
export function calculatePayroll(input: { compensation: PayrollCompensation; overtime?: readonly PayrollOvertime[]; adjustments?: readonly PayrollAdjustment[] }): PayrollCalculation {
  const compensation = input.compensation; int(compensation.cents, 'compensation cents'); int(compensation.scheduledMinutes, 'scheduled minutes'); int(compensation.payableMinutes, 'payable minutes')
  if (compensation.kind === 'monthly' && compensation.scheduledMinutes === 0) throw new Error('Monthly payroll requires contractual scheduled minutes')
  const baseCents = compensation.kind === 'monthly'
    ? mulDivRound(compensation.cents, Math.min(compensation.payableMinutes, compensation.scheduledMinutes), compensation.scheduledMinutes)
    : mulDivRound(compensation.cents, compensation.payableMinutes, 60)
  const hourlyCents = compensation.kind === 'hourly' ? compensation.cents : mulDivRound(compensation.cents, 60, compensation.scheduledMinutes)
  const overtime = [...(input.overtime ?? [])]
  const overtimeCents = overtime.reduce((sum, item) => {
    int(item.approvedMinutes, 'approved overtime minutes'); int(item.multiplierBasisPoints, 'overtime multiplier')
    const factor = item.premiumOnly ? Math.max(0, item.multiplierBasisPoints - 10_000) : item.multiplierBasisPoints
    const overtimeRate = item.hourlyRateCents === undefined ? hourlyCents : int(item.hourlyRateCents, 'overtime hourly cents')
    return sum + mulDivRound(overtimeRate, item.approvedMinutes * factor, 60 * 10_000)
  }, 0)
  const adjustments = [...(input.adjustments ?? [])].filter((item) => item.approved)
  for (const item of adjustments) int(item.cents, 'adjustment cents')
  const bonusCents = adjustments.filter((item) => item.type === 'bonus').reduce((sum, item) => sum + item.cents, 0)
  const deductions = adjustments.filter((item) => item.type === 'deduction' || item.type === 'penalty').reduce((sum, item) => sum + item.cents, 0)
  const grossCents = baseCents + overtimeCents + bonusCents
  const advanceRequested = adjustments.filter((item) => item.type === 'advance_repayment').reduce((sum, item) => sum + item.cents, 0)
  const advanceRecoveryCents = Math.min(advanceRequested, Math.max(0, grossCents - deductions))
  const deductionCents = Math.min(deductions, grossCents)
  const netCents = Math.max(0, grossCents - deductionCents - advanceRecoveryCents)
  return { baseCents, overtimeCents, bonusCents, deductionCents, advanceRecoveryCents, grossCents, netCents, snapshot: { version: 1, compensation: { ...compensation }, overtime, adjustments } }
}
