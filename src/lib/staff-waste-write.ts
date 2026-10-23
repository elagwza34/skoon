import 'server-only'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, hasPermission } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

export class WasteError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const input = z.object({ itemId: z.string().regex(/^\d+$/), batchId: z.string().regex(/^\d+$/).optional(), quantity: z.coerce.number().positive(), cause: z.enum(['expired','damaged','spoilage','kitchen_waste','manual_writeoff']), reason: z.string().trim().min(3).max(255), responsibleId: z.string().uuid().optional(), idempotencyKey: z.string().min(8).max(100) })
const allowed = (s: StaffSession) => s.role === ROLE.OWNER || hasPermission(s.permissions, 'inventory.manage')
export async function recordWaste(session: StaffSession, raw: unknown) {
  if (!allowed(session)) throw new WasteError('غير مصرح', 403); if(process.env.WASTE_IDEMPOTENCY_ENABLED!=='true')throw new WasteError('تسجيل الهدر متوقف لحين تطبيق ترحيل idempotency واختباره',503); const data = input.parse(raw); const itemId = BigInt(data.itemId)
  return prisma.$transaction(async tx => {
    const itemRows = await tx.$queryRaw<{ current_stock: unknown; branch_id: bigint }[]>`SELECT current_stock, branch_id FROM inventory_items WHERE id=${itemId} FOR UPDATE`
    const row = itemRows[0]; if (!row || !staffCanAccessBranch(session, row.branch_id)) throw new WasteError('الصنف غير موجود', 404)
    const fingerprint=createHash('sha256').update(JSON.stringify({itemId:data.itemId,batchId:data.batchId??null,quantity:data.quantity,cause:data.cause,reason:data.reason,responsibleId:data.responsibleId??null})).digest('hex')
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventory-waste:' || ${row.branch_id.toString()} || ':' || ${session.id} || ':' || ${data.idempotencyKey}))`
    const prior=await tx.wasteOperation.findUnique({where:{branchId_actorId_operationType_idempotencyKey:{branchId:row.branch_id,actorId:session.id,operationType:'inventory_waste',idempotencyKey:data.idempotencyKey}}})
    if(prior){if(prior.fingerprint!==fingerprint)throw new WasteError('تم استخدام مفتاح idempotency لطلب مختلف',409);return prior.result as {id:string;cost:string;quantityAfter:string}}
    if (data.responsibleId) { const employee = await tx.user.findFirst({ where: { id: data.responsibleId, branchId: row.branch_id, isActive: true, deletedAt: null }, select: { id: true } }); if (!employee) throw new WasteError('الموظف المسؤول خارج الفرع', 409) }
    const reservations = await tx.inventoryReservation.findMany({ where: { branchId: row.branch_id, inventoryItemId: itemId, status: 'active' }, select: { quantity: true, consumedQuantity: true, releasedQuantity: true } })
    const outstandingReserved = reservations.reduce((sum, r) => sum + Number(r.quantity) - Number(r.consumedQuantity) - Number(r.releasedQuantity), 0)
    if (Number(row.current_stock) - data.quantity < outstandingReserved - 1e-9) throw new WasteError('الهدر سيؤثر على حجوزات طلبات مفتوحة', 409)
    const batches = await tx.inventoryBatch.findMany({ where: { id: data.batchId ? BigInt(data.batchId) : undefined, inventoryItemId: itemId, branchId: row.branch_id, remainingQuantity: { gt: 0 } }, orderBy: [{ expiresAt:'asc' },{ receivedAt:'asc' },{id:'asc'}] })
    let left=data.quantity, physical: { id: bigint; qty:number; cost:number }[]=[]
    for(const b of batches){ if(left<=1e-9) break; await tx.$queryRaw`SELECT id FROM inventory_batches WHERE id=${b.id} FOR UPDATE`; const q=Math.min(left,Number(b.remainingQuantity)); physical.push({id:b.id,qty:q,cost:Number(b.unitCost)}); left=round3(left-q) }
    if(left>1e-9 || Number(row.current_stock)+1e-9<data.quantity) throw new WasteError('الكمية أكبر من المخزون المتاح',409)
    const fifo=await tx.inventoryBatch.findMany({where:{inventoryItemId:itemId,branchId:row.branch_id,remainingCostQuantity:{gt:0}},orderBy:[{receivedAt:'asc'},{id:'asc'}]}); let costLeft=data.quantity,cost=0, costing:{id:bigint;qty:number;cost:number}[]=[]
    for(const b of fifo){if(costLeft<=1e-9)break;await tx.$queryRaw`SELECT id FROM inventory_batches WHERE id=${b.id} FOR UPDATE`;const q=Math.min(costLeft,Number(b.remainingCostQuantity)); costing.push({id:b.id,qty:q,cost:Number(b.unitCost)});cost+=q*Number(b.unitCost);costLeft=round3(costLeft-q)}
    if(costLeft>1e-9) throw new WasteError('لا توجد طبقات FIFO كافية',409); cost=round2(cost)
    const after=round3(Number(row.current_stock)-data.quantity); const movement=await tx.inventoryTransaction.create({data:{inventoryItemId:itemId,branchId:row.branch_id,type:'waste',quantity:(-data.quantity).toFixed(3),quantityAfter:after.toFixed(3),unitCost:(cost/data.quantity).toFixed(4),costTotal:cost.toFixed(2),referenceType:'waste_event',createdById:session.id,notes:data.reason}})
    for(const p of physical){const b=batches.find(x=>x.id===p.id)!;await tx.inventoryBatch.update({where:{id:p.id},data:{remainingQuantity:round3(Number(b.remainingQuantity)-p.qty).toFixed(3)}})}
    for(const p of costing){const b=fifo.find(x=>x.id===p.id)!;await tx.inventoryBatch.update({where:{id:p.id},data:{remainingCostQuantity:round3(Number(b.remainingCostQuantity)-p.qty).toFixed(3)}})}
    await tx.inventoryBatchAllocation.createMany({data:[...physical.map(p=>({inventoryBatchId:p.id,inventoryTransactionId:movement.id,allocationType:'physical',quantity:p.qty.toFixed(3),unitCost:p.cost.toFixed(4)})),...costing.map(p=>({inventoryBatchId:p.id,inventoryTransactionId:movement.id,allocationType:'fifo_cost',quantity:p.qty.toFixed(3),unitCost:p.cost.toFixed(4)}))]});await tx.inventoryItem.update({where:{id:itemId},data:{currentStock:after.toFixed(3)}})
    const waste=await tx.wasteEvent.create({data:{branchId:row.branch_id,responsibleId:data.responsibleId??null,recordedById:session.id,quantity:data.quantity.toFixed(3),cause:data.cause,reason:data.reason,costTotal:cost.toFixed(2)}})
    if(data.responsibleId) await tx.employeeAccountability.create({data:{branchId:row.branch_id,employeeId:data.responsibleId,wasteEventId:waste.id,amount:cost.toFixed(2)}})
    const result={id:waste.id.toString(),cost:cost.toFixed(2),quantityAfter:after.toFixed(3)};await tx.wasteOperation.create({data:{branchId:row.branch_id,actorId:session.id,operationType:'inventory_waste',idempotencyKey:data.idempotencyKey,fingerprint,result}});await tx.auditLog.create({data:{userId:session.id,branchId:row.branch_id,action:'inventory.waste',entityType:'waste_event',entityId:waste.id,newValues:{itemId:data.itemId,quantity:data.quantity,cause:data.cause,cost}}});return result
  },{isolationLevel:'Serializable'})
}
export async function waiveAccountability(session:StaffSession,idRaw:string,raw:unknown){if(session.role!==ROLE.OWNER&&!hasPermission(session.permissions,'inventory.manage'))throw new WasteError('غير مصرح',403);const d=z.object({amount:z.coerce.number().positive(),reason:z.string().trim().min(3).max(255)}).parse(raw);const id=BigInt(idRaw);return prisma.$transaction(async tx=>{const a=await tx.employeeAccountability.findUnique({where:{id},include:{waivers:true}});if(!a||!staffCanAccessBranch(session,a.branchId))throw new WasteError('غير موجود',404);if(a.employeeId===session.id)throw new WasteError('لا يمكن اعتماد إعفاء المساءلة الخاصة بك',403);const remaining=Number(a.amount)-Number(a.waivedAmount)-Number(a.deductedAmount);if(d.amount>remaining+1e-9)throw new WasteError('الإعفاء أكبر من المتبقي',409);const w=await tx.accountabilityWaiver.create({data:{accountabilityId:id,amount:d.amount.toFixed(2),reason:d.reason,managerId:session.id}});await tx.employeeAccountability.update({where:{id},data:{waivedAmount:round2(Number(a.waivedAmount)+d.amount).toFixed(2),reviewStatus:'reviewed',reviewedById:session.id}});await tx.auditLog.create({data:{userId:session.id,branchId:a.branchId,action:'accountability.waive',entityType:'employee_accountability',entityId:id,newValues:{waiverId:w.id.toString(),amount:d.amount,reason:d.reason}}});return {id:w.id.toString(),remaining:round2(remaining-d.amount)}})}
