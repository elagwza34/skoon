import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import ts from 'typescript'
import { financialJson } from '../src/lib/financial-json'

test('employee edit loads owner details, saves nullable username, and preserves authorization', async () => {
  process.env.DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/forbidden'
  process.env.DIRECT_URL = process.env.DATABASE_URL
  const owner = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' as const, branchId: null, name: 'Owner', email: null, permissions: [] }
  let session: any = owner
  let query: any
  const employee: any = {
    id: '22222222-2222-4222-8222-222222222222', name: 'Employee', email: 'employee@example.test', username: null, phone: null, isActive: true, branchId: 2n,
    role: { slug: 'cashier', name: 'Cashier' },
    employeeProfile: { id: 9n, branchId: 2n, employmentStatus: 'active', hireDate: new Date('2026-01-01'), contracts: [{ id: 10n, supersedesId: null }], compensationRates: [{ id: 11n, amount: new Prisma.Decimal('5000.25') }] },
  }
  const updates: any[] = [], audits: any[] = []
  const client: any = {
    user: {
      findFirst: async (input: any) => { query = input; return input.where.branchId !== undefined && input.where.branchId !== employee.branchId ? null : employee },
      update: async ({ data }: any) => { updates.push(data); Object.assign(employee, data); return employee },
    },
    employeeProfile: { upsert: async () => employee.employeeProfile },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data } },
    $transaction: async (body: any) => body(client),
  }
  ;(globalThis as any).prisma = client
  const services = await import('../src/lib/staff-employee-write')
  function route(path: string, overrides: Record<string, unknown> = {}) {
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const exports: any = {}
    const require = (name: string) => {
      if (name === 'next/server') return { NextResponse }
      if (name === '@/lib/financial-json') return { financialJson }
      if (name === '@/lib/session') return { getStaffSession: async () => session }
      if (name === '@/lib/staff-employee-write') return { ...services, ...overrides }
      throw new Error(`Unexpected dependency: ${name}`)
    }
    new Function('require', 'exports', 'module', compiled)(require, exports, { exports })
    return exports
  }
  const detail = route('src/app/api/staff/employees/[id]/route.ts')
  const context = { params: Promise.resolve({ id: employee.id }) }
  const response = await detail.GET(new Request('http://localhost/employee'), context)
  assert.equal(response.status, 200, 'Owner detail must serialize branch/profile/history bigint IDs instead of returning 500')
  const body = await response.json()
  assert.equal(body.branchId, '2')
  assert.equal(body.employeeProfile.id, '9')
  assert.equal(body.employeeProfile.contracts[0].id, '10')
  assert.equal(body.employeeProfile.compensationRates[0].amount, '5000.25')
  assert.equal(query.where.branchId, undefined, 'Owner may load employees across branches')
  assert.equal(typeof detail.PATCH, 'function', 'Edit form must have a PATCH handler')
  const saved = await detail.PATCH(new Request('http://localhost/employee', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Updated employee', username: null }) }), context)
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).id, '9')
  assert.equal(employee.name, 'Updated employee')
  assert.equal(updates.length, 1)
  assert.equal(audits.length, 1)
  const malformed = await detail.PATCH(new Request('http://localhost/employee', { method: 'PATCH', body: '{' }), context)
  assert.equal(malformed.status, 400)
  session = { ...owner, role: 'manager', branchId: '1' }
  assert.equal((await detail.GET(new Request('http://localhost/employee'), context)).status, 404)
  assert.equal((await detail.PATCH(new Request('http://localhost/employee', { method: 'PATCH', body: '{}' }), context)).status, 403)
  session = null
  assert.equal((await detail.GET(new Request('http://localhost/employee'), context)).status, 401)

  session = owner
  for (const [path, action] of [['contracts', 'addEmployeeContract'], ['compensation', 'addCompensationRate']] as const) {
    const history = route(`src/app/api/staff/employees/[id]/${path}/route.ts`, { [action]: async () => ({ id: 12n, employeeId: 9n, amount: new Prisma.Decimal('5000.25') }) })
    const result = await history.POST(new Request('http://localhost/employee', { method: 'POST', body: '{}' }), context)
    assert.equal(result.status, 201, 'Saved contract/rate must serialize successfully after commit')
    assert.equal((await result.json()).id, '12')
  }
})
