import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ROLE } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'

export class BranchBootstrapError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'BranchBootstrapError'
  }
}

export const initialBranchSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, 'رمز الفرع يقبل الحروف والأرقام و - و _ فقط'),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(255).optional(),
})

/**
 * Initializes the only branch in an empty installation. This is deliberately
 * not general branch management: once any branch exists, this route closes.
 */
export async function bootstrapInitialBranch(session: StaffSession, input: unknown) {
  if (session.role !== ROLE.OWNER) throw new BranchBootstrapError('غير مصرح', 403)

  const parsed = initialBranchSchema.safeParse(input)
  if (!parsed.success) throw new BranchBootstrapError(parsed.error.issues[0]?.message ?? 'بيانات الفرع غير صالحة', 400)
  const value = parsed.data
  const code = value.code.toUpperCase()

  try {
    const branch = await prisma.$transaction(async (tx) => {
      // PostgreSQL transaction advisory lock serializes the one-time bootstrap
      // without adding a persistent lock table or weakening tenant boundaries.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(825001)`
      const existing = await tx.cafeBranch.count()
      if (existing > 0) throw new BranchBootstrapError('تم إنشاء فرع بالفعل؛ مسار التهيئة الأولية مغلق.', 409)

      const created = await tx.cafeBranch.create({
        data: {
          name: value.name,
          code,
          phone: value.phone || null,
          address: value.address || null,
          timezone: 'Africa/Cairo',
          isActive: true,
        },
        select: { id: true, name: true, code: true, timezone: true, isActive: true },
      })
      await tx.auditLog.create({
        data: {
          userId: session.id,
          branchId: created.id,
          action: 'branch.bootstrap_initial',
          entityType: 'branch',
          entityId: created.id,
          newValues: { name: created.name, code: created.code, timezone: created.timezone, isActive: true },
        },
      })
      return created
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return { id: branch.id.toString(), name: branch.name, code: branch.code, timezone: branch.timezone, isActive: branch.isActive }
  } catch (error) {
    if (error instanceof BranchBootstrapError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BranchBootstrapError('رمز الفرع مستخدم بالفعل.', 409)
    }
    throw new BranchBootstrapError('تعذر إنشاء الفرع الأول. لم يتم إنشاء حسابات موظفين.', 500)
  }
}
