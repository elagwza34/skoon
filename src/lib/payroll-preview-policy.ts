/** Preview-only payroll arithmetic. It never posts a ledger entry or payment. */
export type PayrollPolicyPreview = {
  dailyWorkingHours: number; lateGraceMinutes: number; overtimeMultiplier: number
  monthlyProration: 'scheduled_working_days'; currency: 'EGP'; financialPostingEnabled: false
}
export const INITIAL_PAYROLL_POLICY: PayrollPolicyPreview = {
  dailyWorkingHours: 8, lateGraceMinutes: 30, overtimeMultiplier: 1.5,
  monthlyProration: 'scheduled_working_days', currency: 'EGP', financialPostingEnabled: false,
}
export type PreviewInput = {
  compensationType: 'monthly' | 'daily' | 'hourly'; rateCents: number
  scheduledDays: number; payableDays: number; payableHours: number
  approvedAllowanceCents?: number; approvedAdvanceRecoveryCents?: number
  approvedOvertimeHours?: number; includeOvertimeEstimate?: boolean
}
export type PayrollPreview = { baseCents: number; overtimeEstimateCents: number; grossCents: number; advanceRecoveryCents: number; netCents: number; warnings: string[]; previewOnly: true }
const cents = (value: number) => Math.round(value)
/** Deterministic estimate only; legal deductions and financial posting are excluded. */
export function calculatePayrollPreview(input: PreviewInput, policy: PayrollPolicyPreview = INITIAL_PAYROLL_POLICY): PayrollPreview {
  if (!Number.isInteger(input.rateCents) || input.rateCents < 0 || input.scheduledDays < 0 || input.payableDays < 0 || input.payableHours < 0) throw new Error('Invalid payroll preview input')
  const warnings = ['معاينة فقط: لا يتم إنشاء دفع أو قيد مالي أو خصم قانوني تلقائياً.']
  const noScheduledDays = input.compensationType === 'monthly' && input.scheduledDays === 0
  const baseCents = input.compensationType === 'monthly'
    ? noScheduledDays ? 0 : cents(input.rateCents * Math.min(input.payableDays, input.scheduledDays) / input.scheduledDays)
    : input.compensationType === 'daily' ? cents(input.rateCents * input.payableDays)
      : cents(input.rateCents * input.payableHours)
  const hourlyRate = input.compensationType === 'hourly' ? input.rateCents : baseCents / Math.max(1, input.payableHours || input.payableDays * policy.dailyWorkingHours)
  const overtimeEstimateCents = input.includeOvertimeEstimate ? cents(hourlyRate * (input.approvedOvertimeHours ?? 0) * policy.overtimeMultiplier) : 0
  if (input.includeOvertimeEstimate) warnings.push('تقدير الإضافي يحتاج اعتماداً قانونياً/محاسبياً قبل التطبيق المالي.')
  if (noScheduledDays) warnings.push('لا توجد أيام عمل مجدولة؛ لم يتم احتساب راتب شهري تقديري.')
  const grossCents = baseCents + overtimeEstimateCents + (input.approvedAllowanceCents ?? 0)
  const recovery = Math.min(Math.max(0, input.approvedAdvanceRecoveryCents ?? 0), grossCents)
  return { baseCents, overtimeEstimateCents, grossCents, advanceRecoveryCents: recovery, netCents: grossCents - recovery, warnings, previewOnly: true }
}
