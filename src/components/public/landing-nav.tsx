'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { Modal } from '@/components/ui/modal'
import { Icon } from '@/components/ui/icon'
import { useMediaQuery } from '@/lib/use-media-query'

const LOGO = '/logo.png'

const navLinks = [
  { href: '#hero', label: 'الرئيسية' },
  { href: '#menu', label: 'المنيو' },
  { href: '#occasions', label: 'المناسبات' },
  { href: '#events', label: 'الفعاليات' },
  { href: '#contact', label: 'تواصل معنا' },
]

export default function LandingNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('#hero')
  const mobile = useMediaQuery('(max-width: 1023px)')
  useEffect(() => { if (!mobile) setDrawerOpen(false) }, [mobile])
  useEffect(() => {
    const update = () => {
      const sections = navLinks.map(link => document.querySelector(link.href)).filter((el): el is Element => !!el)
      const current = sections.filter(el => el.getBoundingClientRect().top <= 150).at(-1)
      setActiveSection(current ? `#${current.id}` : '#hero')
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

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
          <nav className="hidden lg:flex min-w-0 items-center gap-5 xl:gap-12">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={activeSection === link.href ? "location" : undefined}
                className={`text-sm transition-colors ${
                  activeSection === link.href
                    ? 'text-[#B98757]'
                    : 'text-[#D8C5AD] hover:text-[#FFFCF8]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <button
            disabled={!mobile}
            aria-label="فتح القائمة" aria-expanded={drawerOpen} aria-controls="public-navigation" className="lg:hidden flex h-11 w-11 items-center justify-center rounded text-[#FFFCF8]"
            onClick={() => setDrawerOpen((prev) => !prev)}
            type="button"
          >
            <Icon name="menu" size={24} />
          </button>
        </div>
      </header>

      {/* Mobile overlay */}
      {mobile && drawerOpen && <Modal id="public-navigation" aria-label="قائمة التنقل" onClose={() => setDrawerOpen(false)} className="fixed inset-0 z-50 bg-black/60 p-0">
      {/* Mobile drawer */}
      <aside className="flex h-full w-72 max-w-full flex-col overflow-y-auto bg-[#241B17] p-5 text-[#FFFCF8]">
        <div className="flex items-center justify-between pb-[1.25rem]">
          <div className="flex items-center gap-[0.375rem]">
            <Image src={LOGO} alt="سكون" width={32} height={32} className="h-8 w-auto object-contain" />
            <span className="text-base text-[#FFFCF8] font-sans">سكون</span>
          </div>
          <button
            aria-label="إغلاق القائمة" className="flex h-11 w-11 items-center justify-center text-[#D8C5AD] hover:text-[#FFFCF8]"
            onClick={() => setDrawerOpen(false)}
            type="button"
          >
            <Icon name="close" size={24} />
          </button>
        </div>
        <nav className="flex flex-col gap-[1.25rem] mt-[3rem]">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
                aria-current={activeSection === link.href ? "location" : undefined}
              onClick={() => setDrawerOpen(false)}
              className={`text-sm transition-colors ${
                activeSection === link.href
                  ? 'text-[#B98757]'
                  : 'text-[#D8C5AD] hover:text-[#FFFCF8]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      </Modal>}
    </>
  )
}
