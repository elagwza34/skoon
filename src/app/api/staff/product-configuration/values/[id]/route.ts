import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { ROLE } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const valueUpdateSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  priceAdjustment: z.coerce.number().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

const valueReorderSchema = z.object({
  action: z.literal('reorder'),
  valueIds: z.array(z.string().regex(/^\d+$/)).min(1),
})

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER)
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  if (typeof body === 'object' && body !== null && (body as Record<string, unknown>).action === 'reorder') {
    const parsed = valueReorderSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })

    const branchId = session.role === ROLE.OWNER ? null : BigInt(session.branchId as string)
    const values = await prisma.productAttributeValue.findMany({
      where: {
        id: { in: parsed.data.valueIds.map(BigInt) },
        attribute: { ...(branchId ? { branchId } : {}) },
      },
      select: { id: true },
    })
    if (values.length !== parsed.data.valueIds.length)
      return NextResponse.json({ error: 'بعض القيم غير موجودة أو غير مصرح لك بها' }, { status: 404 })

    await prisma.$transaction(
      parsed.data.valueIds.map((valId, index: number) =>
        prisma.productAttributeValue.update({
          where: { id: BigInt(valId) },
          data: { sortOrder: index },
        })
      )
    )
    return NextResponse.json({ ok: true })
  }

  const parsed = valueUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })

  const branchId = session.role === ROLE.OWNER ? null : BigInt(session.branchId as string)
  const existing = await prisma.productAttributeValue.findUnique({
    where: { id: BigInt(id) },
    select: { id: true, label: true, isActive: true, archivedAt: true, attributeId: true, attribute: { select: { id: true, name: true, branchId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'القيمة غير موجودة' }, { status: 404 })
  if (branchId !== null && existing.attribute.branchId.toString() !== branchId.toString())
    return NextResponse.json({ error: 'القيمة غير موجودة' }, { status: 404 })
  if (existing.archivedAt) return NextResponse.json({ error: 'القيمة مؤرشفة بالفعل' }, { status: 409 })

  if (parsed.data.label !== undefined && parsed.data.label !== existing.label) {
    const duplicate = await prisma.productAttributeValue.findFirst({
      where: { label: parsed.data.label, attributeId: existing.attributeId, id: { not: BigInt(id) }, archivedAt: null },
      select: { id: true },
    })
    if (duplicate) return NextResponse.json({ error: 'اسم القيمة مستخدم بالفعل في هذه الخاصية' }, { status: 409 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.label !== undefined) data.label = parsed.data.label.trim()
  if (parsed.data.priceAdjustment !== undefined) {
    data.numerator = Math.round(parsed.data.priceAdjustment * 100)
    data.denominator = BigInt(100)
  }
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder
  if (parsed.data.isActive !== undefined) {
    data.isActive = parsed.data.isActive
    data.archivedAt = parsed.data.isActive ? null : new Date()
  }

  const updated = await prisma.productAttributeValue.update({ where: { id: BigInt(id) }, data })
  return NextResponse.json({
    id: updated.id.toString(),
    label: updated.label,
    priceAdjustment: updated.numerator ? Number(updated.numerator) / 100 : 0,
    isActive: updated.isActive,
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER)
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

  const branchId = session.role === ROLE.OWNER ? null : BigInt(session.branchId as string)
  const existing = await prisma.productAttributeValue.findUnique({
    where: { id: BigInt(id) },
    select: { id: true, label: true, archivedAt: true, attributeId: true, attribute: { select: { branchId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'القيمة غير موجودة' }, { status: 404 })
  if (branchId !== null && existing.attribute.branchId.toString() !== branchId.toString())
    return NextResponse.json({ error: 'القيمة غير موجودة' }, { status: 404 })
  if (existing.archivedAt) return NextResponse.json({ error: 'القيمة مؤرشفة بالفعل' }, { status: 409 })

  const assignmentCount = await prisma.productAttributeAssignmentValue.count({
    where: { valueId: BigInt(id) },
  })
  const variantValueCount = await prisma.productVariantValue.count({
    where: { valueId: BigInt(id) },
  })
  if (assignmentCount > 0 || variantValueCount > 0)
    return NextResponse.json({ error: 'لا يمكن أرشفة قيمة مثبتة على منتج أو متغير. أزل التثبيت أولاً.' }, { status: 409 })

  await prisma.productAttributeValue.update({ where: { id: BigInt(id) }, data: { isActive: false, archivedAt: new Date() } })
  return NextResponse.json({ id: existing.id.toString(), label: existing.label, archived: true })
}
