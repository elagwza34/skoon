'use client'

import { useState } from 'react'
import {
  MENU_ITEMS,
  CATEGORY_LABELS,
  type MenuCategory,
} from './menu-data'

export default function MenuSection() {
  const [activeCategory, setActiveCategory] = useState<MenuCategory>('all')

  const filtered = MENU_ITEMS.filter(
    (item) => activeCategory === 'all' || item.category === activeCategory
  )

  const categories: MenuCategory[] = [
    'all',
    'hot',
    'cold',
    'fresh',
    'dessert',
    'food',
  ]

  return (
    <section className="py-[3.5rem] bg-[#F6F0E7]" id="menu">
      <div className="w-full px-[1rem] lg:px-[3rem]">
        <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
          <span className="text-sm text-[#B98757] tracking-wider font-sans font-semibold">
            قائمة المذاق الفريد
          </span>
          <h2 className="text-[40px] font-bold text-[#241B17] font-sans">
            منيو سكون
          </h2>
          <p className="text-[17px] text-[#4e4541] font-sans">
            اختار اللي يناسب مزاجك من تشكيلتنا المختارة بعناية.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-center flex-wrap gap-2 mb-[3.5rem]">
          {categories.map((cat) => {
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2.5 rounded-full font-sans text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#241B17] text-[#B98757] shadow-md'
                    : 'bg-[#FFFCF8] text-[#1d1b16] hover:text-[#241B17] hover:bg-[#f3ede4] shadow-sm'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            )
          })}
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[1rem]" id="menu-grid">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="menu-card group rounded-[0.5rem] bg-[#FFFCF8] p-[1rem] shadow-md flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              data-category={item.category}
            >
              <div>
                <div className="relative w-full h-[44px] lg:h-[11rem] rounded-[0.5rem] overflow-hidden mb-[0.75rem] bg-[#f3ede4]">
                  <div
                    className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                    style={{ backgroundImage: `url(${item.image})` }}
                  />
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-[#1A1310]/80 backdrop-blur text-[#B98757] text-[10px] font-sans font-medium">
                    {item.badge}
                  </span>
                </div>
                <h4 className="text-[18px] font-bold text-[#241B17] mb-1 font-sans">
                  {item.title}
                </h4>
                <p className="text-[13px] text-[#4e4541] leading-relaxed mb-3 font-sans">
                  {item.desc}
                </p>
              </div>
              <div className="flex items-center justify-between pt-[0.375rem] mt-auto">
                <span className="text-[22px] font-bold text-[#B98757] font-sans">
                  {item.price}
                </span>
                <span className="text-[10px] text-[#1d1b16]/80 font-sans">
                  {item.tag}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Notice */}
        <div className="mt-[3rem] text-center">
          <p className="text-[13px] text-[#4e4541] inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f3ede4] shadow-sm font-sans">
            <span className="material-symbols-outlined text-[#B98757] text-base">
              info
            </span>
            <span>
              الأسعار شاملة ضريبة القيمة المضافة. نرحب بزيارتكم للطلب المباشر في
              الكافيه.
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}