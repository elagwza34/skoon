/**
 * Demo data — LOCAL MOCK ONLY.
 *
 * Everything in this module is fabricated, in-memory sample data used to make
 * the UI preview feel real. It is NOT connected to Prisma, Supabase, or any
 * database. No values here represent real sales, orders, payments or staff.
 *
 * Keeping this separate from components means the real data layer can replace
 * these functions later without touching the UI.
 */

// ---------------------------------------------------------------------------
// Branches (multi-branch ready; only one is active in the demo)
// ---------------------------------------------------------------------------
export interface Branch {
  id: number
  name: string
  code: string
  isPrimary: boolean
}

export const branches: Branch[] = [
  { id: 1, name: 'فرع سكون الرئيسي', code: 'SKN-01', isPrimary: true },
  { id: 2, name: 'فرع المعادي', code: 'SKN-02', isPrimary: false },
  { id: 3, name: 'فرع الزمالك', code: 'SKN-03', isPrimary: false },
]

export const activeBranch = branches[0]

// ---------------------------------------------------------------------------
// Demo account (no real authentication — display only)
// ---------------------------------------------------------------------------
export const demoUser = {
  name: 'أحمد الجوزي',
  role: 'owner' as const,
  initials: 'أج',
}

// ---------------------------------------------------------------------------
// Menu / products
// ---------------------------------------------------------------------------
export interface ProductCategory {
  id: string
  name: string
}

export interface Product {
  id: string
  name: string
  price: number
  categoryId: string
  emoji: string
  available: boolean
}

export const productCategories: ProductCategory[] = [
  { id: 'coffee', name: 'قهوة' },
  { id: 'cold', name: 'مشروبات باردة' },
  { id: 'pastry', name: 'معجنات' },
  { id: 'dessert', name: 'حلويات' },
  { id: 'sandwich', name: 'ساندويتش' },
]

export const products: Product[] = [
  { id: 'p1', name: 'إسبريسو', price: 35, categoryId: 'coffee', emoji: '☕', available: true },
  { id: 'p2', name: 'أمريكانو', price: 40, categoryId: 'coffee', emoji: '☕', available: true },
  { id: 'p3', name: 'لاتيه', price: 55, categoryId: 'coffee', emoji: '🥛', available: true },
  { id: 'p4', name: 'كابتشينو', price: 55, categoryId: 'coffee', emoji: '☕', available: true },
  { id: 'p5', name: 'موكا', price: 65, categoryId: 'coffee', emoji: '🍫', available: true },
  { id: 'p6', name: 'فرابتشينو كاراميل', price: 75, categoryId: 'cold', emoji: '🥤', available: true },
  { id: 'p7', name: 'آيس لاتيه', price: 60, categoryId: 'cold', emoji: '🧊', available: true },
  { id: 'p8', name: 'ليمون بالنعناع', price: 45, categoryId: 'cold', emoji: '🍋', available: true },
  { id: 'p9', name: 'كرواسون زبدة', price: 35, categoryId: 'pastry', emoji: '🥐', available: true },
  { id: 'p10', name: 'مافين شوكولاتة', price: 40, categoryId: 'pastry', emoji: '🧁', available: false },
  { id: 'p11', name: 'تشيز كيك', price: 65, categoryId: 'dessert', emoji: '🍰', available: true },
  { id: 'p12', name: 'براوني', price: 45, categoryId: 'dessert', emoji: '🍫', available: true },
  { id: 'p13', name: 'ساندويتش جبنة', price: 55, categoryId: 'sandwich', emoji: '🥪', available: true },
  { id: 'p14', name: 'ساندويتش دجاج', price: 70, categoryId: 'sandwich', emoji: '🥪', available: true },
  { id: 'p15', name: 'كلوب ساندويتش', price: 80, categoryId: 'sandwich', emoji: '🥪', available: true },
]

export function productById(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}
