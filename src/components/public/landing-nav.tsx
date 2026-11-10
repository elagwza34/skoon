'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const LOGO =
  'https://lh3.googleusercontent.com/aida/ALJJyrAVYs6WPNK-08neMS-jRXVIlMP11b_p6MmYfGWTT8GOUwxVOkaocq4a9iKTxJ8n2ebbC-7sqJ7A__Hk6oPzgwuWjikY8BHh68ftcUkvwR9ETDKqSFkXBBD1-qyUBNaDRiI79PbaRB1uVPZHSUZDPFU9zYm2MUCkxX1Uuqs_vYC1pNmbIfaQ4JmWvrrx1vQhK__Wdm7n0NGbmECKGfcxC2dSkEFQC6YlXqLZq2OPyCARgKXn76C9DlNm9K0X'

const navLinks = [
  { href: '#', label: 'الرئيسية', active: true },
  { href: '#menu', label: 'المنيو' },
  { href: '#occasions', label: 'المناسبات' },
  { href: '#events', label: 'الفعاليات' },
  { href: '#contact', label: 'تواصل معنا' },
]

export default function LandingNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <header
        className="fixed top-0 w-full z-50 bg-[#1A1310]/90 backdrop-blur-xl transition-all duration-300 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
      >
        <div className="h-20 w-full px-[1rem] lg:px-[3rem] flex items-center justify-between">
          <div className="flex items-center gap-[0.75rem]">
            <Image src={LOGO} alt="سكون كافيه" className="h-8 w-auto object-contain" priority />
            <span className="text-xl text-[#FFFCF8] tracking-wide font-sans">
              سكون كافيه
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-[3.5rem]">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  link.active
                    ? 'text-[#B98757]'
                    : 'text-[#D8C5AD] hover:text-[#FFFCF8]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-[0.75rem]">
            <div className="w-8 h-8 rounded-full bg-[#050201] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#ffffff] text-[18px]">
                person
              </span>
            </div>
            <button
              className="md:hidden flex items-center justify-center text-[#FFFCF8] focus:outline-none"
              onClick={() => setDrawerOpen((prev) => !prev)}
              type="button"
            >
              <span className="material-symbols-outlined text-2xl">menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-[#1A1310]/70 backdrop-blur-sm z-50 transition-opacity duration-300"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-72 bg-[#241B17] z-50 transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col p-[1.25rem] ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between pb-[1.25rem]">
          <div className="flex items-center gap-[0.375rem]">
            <Image src={LOGO} alt="سكون" className="h-8 w-auto object-contain" />
            <span className="text-base text-[#FFFCF8] font-sans">سكون</span>
          </div>
          <button
            className="text-[#D8C5AD] hover:text-[#FFFCF8]"
            onClick={() => setDrawerOpen(false)}
            type="button"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>
        <nav className="flex flex-col gap-[1.25rem] mt-[3rem]">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className={`text-sm transition-colors ${
                link.active
                  ? 'text-[#B98757]'
                  : 'text-[#D8C5AD] hover:text-[#FFFCF8]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  )
}
