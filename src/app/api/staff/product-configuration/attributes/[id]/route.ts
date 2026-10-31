import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { ROLE } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const attrUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

const attrReorderSchema = z.object({
  action: z.literal('reorder'),
  attributeIds: z.array(z.string().regex(/^\d+$/)).min(1),
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
    const parsed = attrReorderSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })

    const branchId = session.role === ROLE.OWNER ? null : BigInt(session.branchId as string)
    const attrs = await prisma.productAttribute.findMany({
      where: { id: { in: parsed.data.attributeIds.map(BigInt) }, ...(branchId ? { branchId } : {}) },
      select: { id: true },
    })
    if (attrs.length !== parsed.data.attributeIds.length)
      return NextResponse.json({ error: 'بعض الخصائص غير موجودة أو غير مصرح لك بها' }, { status: 404 })

    await prisma.$transaction(
      parsed.data.attributeIds.map((attrId, index: number) =>
        prisma.productAttribute.update({
          where: { id: BigInt(attrId) },
          data: { sortOrder: index },
        })
      )
    )
    return NextResponse.json({ ok: true })
  }

  const parsed = attrUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 })

  const branchId = session.role === ROLE.OWNER ? null : BigInt(session.branchId as string)
  const existing = await prisma.productAttribute.findFirst({
    where: { id: BigInt(id), ...(branchId ? { branchId } : {}) },
    select: { id: true, name: true, isActive: true, archivedAt: true },
  })
  if (!existing) return NextResponse.json({ error: 'الخاصية غير موجودة' }, { status: 404 })

  if (parsed.data.name !== undefined && parsed.data.name !== existing.name) {
    const duplicate = await prisma.productAttribute.findFirst({
      where: { name: parsed.data.name, ...(branchId ? { branchId } : {}), id: { not: BigInt(id) }, archivedAt: null },
      select: { id: true },
    })
    if (duplicate) return NextResponse.json({ error: 'اسم الخاصية مستخدم بالفعل' }, { status: 409 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim()
  if (parsed.data.description !== undefined) data.description = parsed.data.description
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder
  if (parsed.data.isActive !== undefined) {
    data.isActive = parsed.data.isActive
    data.archivedAt = parsed.data.isActive ? null : new Date()
  }

  const updated = await prisma.productAttribute.update({ where: { id: BigInt(id) }, data })
  return NextResponse.json({ id: updated.id.toString(), name: updated.name, isActive: updated.isActive })
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER)
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

  const branchId = session.role === ROLE.OWNER ? null : BigInt(session.branchId as string)
  const existing = await prisma.productAttribute.findUnique({
    where: { id: BigInt(id) },
    select: { id: true, name: true, archivedAt: true },
  })
  if (!existing) return NextResponse.json({ error: 'الخاصية غير موجودة' }, { status: 404 })
  // Branch check
  if (branchId !== null) {
    const attr = await prisma.productAttribute.findUnique({
      where: { id: BigInt(id) },
      select: { branchId: true },
    })
    if (!attr || attr.branchId.toString() !== branchId.toString())
      return NextResponse.json({ error: 'الخاصية غير موجودة' }, { status: 404 })
  }
  if (existing.archivedAt) return NextResponse.json({ error: 'الخاصية مؤرشفة بالفعل' }, { status: 409 })

  const assignmentCount = await prisma.productAttributeAssignment.count({
    where: { attributeId: BigInt(id) },
  })
  if (assignmentCount > 0)
    return NextResponse.json({ error: 'لا يمكن أرشفة خاصية مثبتة على منتج. أزل التثبيت أولاً.' }, { status: 409 })

  await prisma.productAttribute.update({ where: { id: BigInt(id) }, data: { isActive: false, archivedAt: new Date() } })
  return NextResponse.json({ id: existing.id.toString(), name: existing.name, archived: true })
}
