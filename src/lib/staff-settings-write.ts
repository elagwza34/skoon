import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

/**
 * Settings write — server-only. Owner/manager only, branch-scoped.
 *
 * SECURITY: only allowlisted keys are writable, each with its own validated
 * type/range. Unknown keys are rejected (no arbitrary rows injected into
 * app_settings), values are never echoed back, and every write is audited.
 *
 * Note on branch scoping: `app_settings.branch_id` uses 0 for GLOBAL settings
 * (legacy default in the schema). V1 writes only branch-specific rows
 * (branchId = a real branch id); global settings stay operator-managed.
 */

export class SettingsError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SettingsError'
    this.status = status
  }
}

/** Writable setting keys → validation. Keep small and explicit. */
export const SETTING_DEFS = {
  currency: {
    label: 'العملة',
    kind: 'string',
    validate: (v: string) => (/^[A-Z]{3}$/.test(v) ? null : 'العملة تُكتب بثلاث أحرف لاتينية كبيرة (مثال: EGP)'),
  },
  tax_name: {
    label: 'اسم الضريبة',
    kind: 'string',
    validate: (v: string) => (v.length >= 2 && v.length <= 40 ? null : 'اسم الضريبة من 2 إلى 40 حرفاً'),
  },
  tax_rate: {
    label: 'نسبة الضريبة (%)',
    kind: 'number',
    validate: (v: number) => (v >= 0 && v <= 100 ? null : 'النسبة بين 0 و 100'),
  },
  tax_enabled: {
    label: 'تفعيل الضريبة',
    kind: 'boolean',
    validate: () => null,
  },
  store_name: {
    label: 'اسم المحل',
    kind: 'string',
    validate: (v: string) => (v.length >= 2 && v.length <= 100 ? null : 'الاسم من 2 إلى 100 حرف'),
  },
  phone: {
    label: 'رقم الهاتف',
    kind: 'string',
    validate: (v: string) => (/^[0-9+\-\s]{5,20}$/.test(v) ? null : 'رقم هاتف غير صالح'),
  },
} as const

export type SettingKey = keyof typeof SETTING_DEFS

const writeSchema = z.object({
  branchId: z.string().regex(/^\d+$/, 'فرع غير صالح').optional(),
  values: z.record(z.union([z.string(), z.number(), z.boolean()])).refine((v) => Object.keys(v).length > 0, {
    message: 'لا توجد قيم للتعديل',
  }),
})

export interface SettingsUpdateResult {
  branchId: string
  updated: string[]
}

/** Persist validated settings for a branch — owner/manager only. */
export async function updateBranchSettings(
  session: StaffSession,
  input: unknown,
): Promise<SettingsUpdateResult> {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new SettingsError('غير مصرح', 403)

  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) throw new SettingsError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { values } = parsed.data

  // Resolve target branch: manager is pinned to their own branch; owner picks.
  let targetBranchId: bigint
  if (session.role === ROLE.OWNER) {
    if (!parsed.data.branchId) throw new SettingsError('اختر الفرع أولاً', 400)
    targetBranchId = BigInt(parsed.data.branchId)
    const branch = await prisma.cafeBranch.findFirst({
      where: { id: targetBranchId, isActive: true },
      select: { id: true },
    })
    if (!branch) throw new SettingsError('الفرع غير موجود', 404)
  } else {
    if (!session.branchId) throw new SettingsError('لا يوجد فرع مرتبط بحسابك', 400)
    targetBranchId = BigInt(session.branchId)
    if (parsed.data.branchId && !staffCanAccessBranch(session, parsed.data.branchId))
      throw new SettingsError('غير مصرح بهذا الفرع', 403)
  }

  // Validate every provided key against its allowlist definition.
  const updates: { key: SettingKey; value: string; type: string }[] = []
  for (const [key, raw] of Object.entries(values)) {
    const def = (SETTING_DEFS as Record<string, { label: string; kind: string; validate: (v: never) => string | null }>)[key]
    if (!def) throw new SettingsError(`إعداد غير معروف: ${key}`, 400)

    let value: string
    let type: string
    if (def.kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) throw new SettingsError(`قيمة غير صالحة لإعداد ${def.label}`, 400)
      const err = (def.validate as (v: number) => string | null)(n)
      if (err) throw new SettingsError(err, 400)
      value = String(n)
      type = 'number'
    } else if (def.kind === 'boolean') {
      const b = typeof raw === 'boolean' ? raw : raw === 'true'
      const err = (def.validate as (v: boolean) => string | null)(b)
      if (err) throw new SettingsError(err, 400)
      value = String(b)
      type = 'boolean'
    } else {
      const s = String(raw).trim()
      const err = (def.validate as (v: string) => string | null)(s)
      if (err) throw new SettingsError(err, 400)
      value = s
      type = 'string'
    }
    updates.push({ key: key as SettingKey, value, type })
  }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.appSetting.upsert({
        where: { branchId_key: { branchId: targetBranchId, key: u.key } },
        create: { branchId: targetBranchId, key: u.key, value: u.value, type: u.type, updatedById: session.id },
        update: { value: u.value, type: u.type, updatedById: session.id },
      })
    }
    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: targetBranchId,
        action: 'settings.update',
        entityType: 'app_setting',
        newValues: { keys: updates.map((u) => u.key) },
      },
    })
  })

  return { branchId: targetBranchId.toString(), updated: updates.map((u) => u.key) }
}
