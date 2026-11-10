import LandingNav from '@/components/public/landing-nav'
import LandingHero from '@/components/public/landing-hero'
import AboutSection from '@/components/public/about-section'
import MenuSection from '@/components/public/menu-section'
import OccasionsSection from '@/components/public/occasions-section'
import EventsSection from '@/components/public/events-section'
import GallerySection from '@/components/public/gallery-section'
import WhySokoonSection from '@/components/public/why-sokoon-section'
import SocialQRSection from '@/components/public/social-qr-section'
import ContactSection from '@/components/public/contact-section'
import LandingFooter from '@/components/public/landing-footer'

/**
 * Skoon — Premium Café Landing Page (Arabic-first, RTL).
 * Composed from the provided HTML design, converted to Next.js/React components.
 * All sections are responsive (sm/md/lg) and use the project's RTL setup.
 */
export default function LandingPage() {
  return (
    <div className="relative min-h-dvh bg-[#fff9ef] text-[#1d1b16]" dir="rtl" lang="ar">
      <LandingNav />

      <main className="w-full select-none">
        <LandingHero />
        <AboutSection />
        <MenuSection />
        <OccasionsSection />
        <EventsSection />
        <GallerySection />
        <WhySokoonSection />
        <SocialQRSection />
        <ContactSection />
      </main>

      <LandingFooter />
    </div>
  )
}
