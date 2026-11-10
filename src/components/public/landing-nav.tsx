'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const LOGO = '/logo.png'

const navLinks = [
  { href: '#', label: 'الرئيسية', active: true },
  { href: '#menu', label: 'المنيو' },
  { href: '#occasions', label: 'المناسبات' },
  { href: '#events', label: 'الفعاليات' },
  { href: '#contact', label: 'تواصل معنا' },
]

export default function LandingNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#1A1310]/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]'
            : 'bg-transparent'
        }`}
      >
        <div className="h-24 w-full px-[1rem] lg:px-[3rem] flex items-center justify-between">
          <div className="flex items-center gap-[1rem]">
            <Image src={LOGO} alt="سكون كافيه" width={64} height={64} className="h-16 w-auto object-contain" priority />
  
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
          <button
            className="md:hidden flex items-center justify-center text-[#FFFCF8] focus:outline-none"
            onClick={() => setDrawerOpen((prev) => !prev)}
            type="button"
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
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
            <Image src={LOGO} alt="سكون" width={32} height={32} className="h-8 w-auto object-contain" />
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
