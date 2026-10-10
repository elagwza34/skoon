// prisma/seed-demo.ts — demo branch + tables + menu (idempotent, non-destructive).
//
// WHY THIS EXISTS
//   prisma/seed.ts seeds ONLY reference data (roles/permissions) by design and
//   never creates a branch/menu. This companion seed populates ONE demo branch
//   so the customer QR flow (menu → table → order) has real rows to work with.
//
// WHAT IT DOES
//   - Upserts one demo branch (code=MAIN).
//   - Creates 10 cafe tables, each with a fresh 16-hex (64-bit) public_token —
//     the QR capability secret. Regenerates on collision (UNIQUE index).
//   - Upserts categories + a realistic cafe menu (prices are what the order API
//     re-prices from — the client never trusts them).
//
// WHAT IT NEVER DOES
//   - Creates User rows (still provisioned only via the trusted owner flow).
//   - Touches roles/permissions or deletes existing rows.
//
// Run: npx tsx prisma/seed-demo.ts
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'node:crypto'

const prisma = new PrismaClient()

/** 16 lowercase hex chars = 64 bits, matching cafe_tables.public_token CHAR(16). */
function newToken(): string {
  return randomBytes(8).toString('hex')
}

/** Generate a token not already present in the DB (UNIQUE guarantee). */
async function uniqueToken(used: Set<string>): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const t = newToken()
    if (used.has(t)) continue
    const clash = await prisma.cafeTable.findUnique({ where: { publicToken: t }, select: { id: true } })
    if (!clash) {
      used.add(t)
      return t
    }
  }
  throw new Error('Could not generate a unique table token after 20 attempts')
}

const TABLES: { number: string; name?: string; capacity: number }[] = [
  { number: '1', name: 'نافذة', capacity: 2 },
  { number: '2', capacity: 4 },
  { number: '3', capacity: 4 },
  { number: '4', capacity: 6 },
  { number: '5', name: 'زاوية', capacity: 4 },
  { number: '6', capacity: 2 },
  { number: '7', capacity: 4 },
  { number: '8', capacity: 8 },
  { number: '9', capacity: 4 },
  { number: '10', name: 'تراس', capacity: 6 },
]

const CATEGORIES: {
  name: string
  slug: string
  products: { name: string; description?: string; price: number; prepTimeMinutes?: number }[]
}[] = [
  {
    name: 'مشروبات ساخنة',
    slug: 'hot-drinks',
    products: [
      { name: 'إسبريسو', description: 'شوت مفرد مركّز', price: 35, prepTimeMinutes: 3 },
      { name: 'أمريكانو', price: 40, prepTimeMinutes: 3 },
      { name: 'كابتشينو', price: 55, prepTimeMinutes: 5 },
      { name: 'لاتيه', price: 60, prepTimeMinutes: 5 },
      { name: 'هوت شوكليت', price: 65, prepTimeMinutes: 6 },
      { name: 'شاي أخضر', price: 30, prepTimeMinutes: 4 },
    ],
  },
  {
    name: 'مشروبات باردة',
    slug: 'cold-drinks',
    products: [
      { name: 'آيس لاتيه', price: 65, prepTimeMinutes: 5 },
      { name: 'آيس أمريكانو', price: 45, prepTimeMinutes: 3 },
      { name: 'فرابتة كاراميل', price: 80, prepTimeMinutes: 7 },
      { name: 'ليموناضة بالنعناع', price: 50, prepTimeMinutes: 4 },
      { name: 'عصير برتقال طازة', price: 55, prepTimeMinutes: 3 },
    ],
  },
  {
    name: 'معجنات',
    slug: 'bakery',
    products: [
      { name: 'كرواسون زبدة', price: 45, prepTimeMinutes: 2 },
      { name: 'بان كيك بالعسل', price: 70, prepTimeMinutes: 8 },
      { name: 'مُفن بلوبيري', price: 50, prepTimeMinutes: 2 },
      { name: 'كيكة القهوة', price: 60, prepTimeMinutes: 3 },
    ],
  },
  {
    name: 'حلويات',
    slug: 'desserts',
    products: [
      { name: 'تشيز كيك', price: 85, prepTimeMinutes: 3 },
      { name: 'براونيز', price: 70, prepTimeMinutes: 3 },
      { name: 'تيراميسو', price: 90, prepTimeMinutes: 3 },
    ],
  },
]

async function main() {
  const branch = await prisma.cafeBranch.upsert({
    where: { code: 'MAIN' },
    update: { isActive: true },
    create: { name: 'سكون — الفرع الرئيسي', code: 'MAIN', timezone: 'Africa/Cairo', isActive: true },
  })

  const usedTokens = new Set<string>(
    (await prisma.cafeTable.findMany({ select: { publicToken: true } })).map((t) => t.publicToken),
  )

  let tablesCreated = 0
  const tableTokens: { number: string; token: string }[] = []
  let sort = 0
  for (const spec of TABLES) {
    const existing = await prisma.cafeTable.findUnique({
      where: { branchId_number: { branchId: branch.id, number: spec.number } },
      select: { publicToken: true },
    })
    let token = existing?.publicToken
    if (!token) {
      token = await uniqueToken(usedTokens)
      await prisma.cafeTable.create({
        data: {
          branchId: branch.id,
          number: spec.number,
          name: spec.name ?? null,
          capacity: spec.capacity,
          publicToken: token,
          isActive: true,
          sortOrder: sort++,
        },
      })
      tablesCreated++
    }
    tableTokens.push({ number: spec.number, token })
  }

  let categoriesCount = 0
  let productsCreated = 0
  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    const cat = CATEGORIES[ci]
    const category = await prisma.category.upsert({
      where: { branchId_slug: { branchId: branch.id, slug: cat.slug } },
      update: { isActive: true },
      create: { branchId: branch.id, name: cat.name, slug: cat.slug, isActive: true, sortOrder: ci },
    })
    categoriesCount++
    for (let pi = 0; pi < cat.products.length; pi++) {
      const p = cat.products[pi]
      const existing = await prisma.product.findFirst({
        where: { branchId: branch.id, categoryId: category.id, name: p.name, deletedAt: null },
        select: { id: true },
      })
      if (!existing) {
        await prisma.product.create({
          data: {
            branchId: branch.id,
            categoryId: category.id,
            name: p.name,
            description: p.description ?? null,
            price: p.price.toFixed(2),
            isActive: true,
            isAvailable: true,
            prepTimeMinutes: p.prepTimeMinutes ?? 5,
            sortOrder: pi,
          },
        })
        productsCreated++
      }
    }
  }

  console.log(
    JSON.stringify({
      branch: { id: branch.id.toString(), code: branch.code, name: branch.name },
      tablesCreated,
      tables: tableTokens,
      categoriesCount,
      productsCreated,
    }),
  )
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
