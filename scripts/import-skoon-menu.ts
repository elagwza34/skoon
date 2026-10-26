import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const branchCode = process.env.SKOON_MENU_BRANCH || 'MAIN'
const execute = process.argv.includes('--execute')
const enable = process.argv.includes('--enable')

type Item = { category: string; name: string; price: string }
const menu: Item[] = [
  { category: 'عصائر', name: 'مانجو', price: '90.00' },
  { category: 'عصائر', name: 'فراولة', price: '80.00' },
  { category: 'عصائر', name: 'برتقال', price: '70.00' },
  { category: 'عصائر', name: 'جوافة', price: '70.00' },
  { category: 'عصائر', name: 'كيوي', price: '100.00' },
  { category: 'عصائر', name: 'بطيخ', price: '80.00' },
  { category: 'عصائر', name: 'ليمون', price: '70.00' },
  { category: 'عصائر', name: 'ليمون نعناع', price: '75.00' },
  { category: 'عصائر', name: 'موز', price: '80.00' },
  { category: 'عصائر', name: 'أفوكادو', price: '110.00' },
  { category: 'سموزي', name: 'مانجو', price: '90.00' }, { category: 'سموزي', name: 'فراولة', price: '80.00' }, { category: 'سموزي', name: 'بطيخ', price: '80.00' }, { category: 'سموزي', name: 'ليمون', price: '70.00' }, { category: 'سموزي', name: 'ليمون نعناع', price: '75.00' }, { category: 'سموزي', name: 'بلوبيري', price: '80.00' }, { category: 'سموزي', name: 'مكس بيري', price: '80.00' }, { category: 'سموزي', name: 'خوخ', price: '80.00' }, { category: 'سموزي', name: 'باشون فروت', price: '80.00' }, { category: 'سموزي', name: 'بلو ليون', price: '80.00' },
  { category: 'مشروبات ساخنة', name: 'كابتشينو', price: '75.00' }, { category: 'مشروبات ساخنة', name: 'نسكافيه', price: '65.00' }, { category: 'مشروبات ساخنة', name: 'أمريكانو', price: '60.00' }, { category: 'مشروبات ساخنة', name: 'كورتادو', price: '65.00' }, { category: 'مشروبات ساخنة', name: 'قهوة تركي عادي', price: '45.00' }, { category: 'مشروبات ساخنة', name: 'قهوة فرنساوي', price: '45.00' }, { category: 'مشروبات ساخنة', name: 'قهوة بندق', price: '45.00' }, { category: 'مشروبات ساخنة', name: 'هوت شوكليت', price: '75.00' }, { category: 'مشروبات ساخنة', name: 'هوت سيدر', price: '60.00' }, { category: 'مشروبات ساخنة', name: 'هوت أوريو', price: '75.00' }, { category: 'مشروبات ساخنة', name: 'شاي', price: '20.00' }, { category: 'مشروبات ساخنة', name: 'أعشاب', price: '20.00' }, { category: 'مشروبات ساخنة', name: 'فيتامين سي', price: '30.00' },
  { category: 'آيس كوفي', name: 'آيس لاتيه', price: '75.00' }, { category: 'آيس كوفي', name: 'آيس اسبانيش لاتيه', price: '75.00' }, { category: 'آيس كوفي', name: 'آيس كابتشينو', price: '75.00' }, { category: 'آيس كوفي', name: 'آيس أمريكانو', price: '60.00' }, { category: 'آيس كوفي', name: 'آيس موكا', price: '75.00' }, { category: 'آيس كوفي', name: 'آيس كراميل ميكاتو', price: '75.00' },
  { category: 'كوكتيل', name: 'هاواي', price: '100.00' }, { category: 'كوكتيل', name: 'فلوريدا', price: '100.00' }, { category: 'كوكتيل', name: 'مانجو باشون', price: '90.00' }, { category: 'كوكتيل', name: 'مانجو خوخ', price: '90.00' }, { category: 'كوكتيل', name: 'بينا كولادا', price: '100.00' }, { category: 'كوكتيل', name: 'سكون كوكتيل', price: '120.00' }, { category: 'كوكتيل', name: 'عوار قلب', price: '100.00' },
  { category: 'موهيتو', name: 'موهيتو كلاسيك', price: '60.00' }, { category: 'موهيتو', name: 'موهيتو باشون فروت', price: '60.00' }, { category: 'موهيتو', name: 'موهيتو بلوبيري', price: '60.00' }, { category: 'موهيتو', name: 'موهيتو فراولة', price: '60.00' }, { category: 'موهيتو', name: 'موهيتو خوخ', price: '60.00' }, { category: 'موهيتو', name: 'موهيتو ريدبول', price: '100.00' }, { category: 'موهيتو', name: 'إلكتريك ليمون', price: '80.00' }, { category: 'موهيتو', name: 'صن شاين', price: '80.00' }, { category: 'موهيتو', name: 'صن رايز', price: '80.00' },
]

const normalize = (value: string) => value.normalize('NFKC').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase()

async function main() {
  const branch = await prisma.cafeBranch.findFirst({ where: { code: branchCode, isActive: true }, select: { id: true, name: true } })
  if (!branch) throw new Error('Active target branch was not found')
  const [categories, products] = await Promise.all([prisma.category.findMany({ where: { branchId: branch.id, deletedAt: null }, select: { id: true, name: true } }), prisma.product.findMany({ where: { branchId: branch.id, deletedAt: null }, select: { name: true, price: true, category: { select: { name: true } } } })])
  const known = new Map(products.map((product) => [normalize(product.category.name) + ':' + normalize(product.name), product]))
  const created: Item[] = []; const existing: string[] = []; const conflicts: string[] = []
  for (const item of menu) { const current = known.get(normalize(item.category) + ':' + normalize(item.name)); if (!current) created.push(item); else if (Number(current.price) === Number(item.price)) existing.push(item.category + ' / ' + item.name); else conflicts.push(item.category + ' / ' + item.name) }
  if (execute && !conflicts.length) await prisma.$transaction(async (tx) => {
    const categoryIds = new Map(categories.map((category) => [normalize(category.name), category.id]))
    for (const categoryName of [...new Set(created.map((item) => item.category))]) {
      const normalized = normalize(categoryName)
      if (!categoryIds.has(normalized)) {
        const category = await tx.category.create({ data: { branchId: branch.id, name: categoryName, slug: 'menu-' + normalized.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') } })
        categoryIds.set(normalized, category.id)
      }
    }
    for (const item of created) await tx.product.create({ data: { branchId: branch.id, categoryId: categoryIds.get(normalize(item.category))!, name: item.name, price: item.price, isAvailable: false } })
  }, { timeout: 30_000 })
  if (enable) for (const item of menu) await prisma.product.updateMany({ where: { branchId: branch.id, name: item.name, category: { name: item.category }, deletedAt: null }, data: { isAvailable: true } })
  console.log(JSON.stringify({ branch: branch.name, mode: execute ? 'executed' : 'dry-run', created, existing, conflicts }, null, 2))
}

main().finally(() => prisma.$disconnect())
