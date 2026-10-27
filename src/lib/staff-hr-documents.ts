import { Prisma } from '@prisma/client'
import { canReadSensitiveEmployeeData } from '@/lib/hr-authz'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import type { StaffSession } from '@/lib/session'

export class HrDocumentError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'HrDocumentError' } }
const allowedKinds = new Set(['national_id_front', 'national_id_back', 'signed_contract', 'other'])
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const maxBytes = 8 * 1024 * 1024
const filenameExtension: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
function owner(session: StaffSession) { if (!canReadSensitiveEmployeeData(session.role)) throw new HrDocumentError('Owner access is required', 403) }
function bucket() { const value = process.env.HR_DOCUMENTS_BUCKET; if (!value || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value)) throw new HrDocumentError('Private HR document storage is not configured', 503); return value }
function unavailable(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') throw new HrDocumentError('Phase D HR migration is not applied yet', 503); throw error }

/** Uploads only through the authenticated server client. The configured bucket
 * must already be private with Storage RLS; this code never creates a bucket. */
export async function uploadEmployeeDocument(session: StaffSession, employeeUserId: string, kind: string, file: File) {
  owner(session)
  if (!allowedKinds.has(kind)) throw new HrDocumentError('Unsupported document type')
  if (!(file instanceof File) || file.size <= 0 || file.size > maxBytes || !allowedTypes.has(file.type)) throw new HrDocumentError('Document must be a PDF, JPEG, PNG, or WebP under 8 MB')
  const storageBucket = bucket()
  try {
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: employeeUserId }, select: { id: true } })
    if (!profile) throw new HrDocumentError('Employee HR profile not found', 404)
    const crypto = globalThis.crypto
    const path = `employee/${profile.id.toString()}/${kind}/${crypto.randomUUID()}.${filenameExtension[file.type]}`
    const storage = await createClient()
    const { error } = await storage.storage.from(storageBucket).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })
    if (error) throw new HrDocumentError('Private document upload was rejected by Storage', 503)
    try {
      const row = await prisma.employeeDocument.create({ data: { employeeId: profile.id, kind, storagePath: path, uploadedById: session.id } })
      return row
    } catch (error) {
      await storage.storage.from(storageBucket).remove([path])
      throw error
    }
  } catch (error) { return unavailable(error) }
}

export async function listEmployeeDocuments(session: StaffSession, employeeUserId: string) {
  owner(session)
  try {
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: employeeUserId }, select: { id: true } })
    if (!profile) throw new HrDocumentError('Employee HR profile not found', 404)
    return await prisma.employeeDocument.findMany({ where: { employeeId: profile.id }, orderBy: { createdAt: 'desc' } })
  } catch (error) { return unavailable(error) }
}

/** A signed URL is issued only after owner authorization and expires in 60s. */
export async function signEmployeeDocument(session: StaffSession, id: bigint) {
  owner(session)
  try {
    const document = await prisma.employeeDocument.findUnique({ where: { id } })
    if (!document) throw new HrDocumentError('Document not found', 404)
    const storage = await createClient()
    const { data, error } = await storage.storage.from(bucket()).createSignedUrl(document.storagePath, 60)
    if (error || !data?.signedUrl) throw new HrDocumentError('Unable to issue private document link', 503)
    return { url: data.signedUrl, expiresIn: 60 }
  } catch (error) { return unavailable(error) }
}
