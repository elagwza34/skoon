import Image from 'next/image'

import { PublicIcon } from '@/components/public/public-icon'
export default function LandingFooter() {
  const LOGO = '/logo.png'

  const links = [
    { label: 'الرئيسية', href: '#' },
    { label: 'المنيو', href: '#menu' },
    { label: 'المناسبات', href: '#occasions' },
    { label: 'الفعاليات', href: '#events' },
    { label: 'تواصل معنا', href: '#contact' },
  ]

  return (
    <footer className="w-full bg-[#241B17] text-[#FFFCF8] py-[3.5rem] shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="w-full px-[1rem] lg:px-[3rem] flex flex-col items-center text-center gap-[3.5rem]">
        <div className="flex flex-col items-center gap-[0.375rem]">
          <Image src={LOGO} alt="سكون كافيه" width={96} height={48} className="h-12 w-auto object-contain" />
          <span className="text-[22px] text-[#B98757] tracking-wide font-sans font-medium">
            SOKOON CAFÉ
          </span>
        </div>
        <p className="text-[17px] text-[#D8C5AD] max-w-[32rem] font-sans">
          سكون.. مكانك للحظات الهدوء والقعدة الحلوة.
        </p>
        <nav className="flex flex-wrap justify-center items-center gap-[3.5rem]">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm text-[#D8C5AD] hover:text-[#FFFCF8] transition-colors font-sans"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-[1rem]">
          {[{ icon: 'camera', label: 'صور سكون', href: '#gallery' }, { icon: 'public', label: 'موقع الكافيه', href: '#contact' }, { icon: 'alternate_email', label: 'صفحة سكون على فيسبوك', href: 'https://web.facebook.com/profile.php?id=61594909603821' }].map((social) => (
            <a
              key={social.icon}
              href={social.href}
              aria-label={social.label}
              className="w-11 h-11 rounded-full bg-[#241b17] flex items-center justify-center text-[#D8C5AD] hover:text-[#D4AF37] transition-colors"
            >
              <PublicIcon symbol={social.icon} className="text-[18px]" />
            </a>
          ))}
        </div>
        <p className="text-[13px] text-[#90827c] font-sans">
          © 2026 SOKOON CAFÉ — جميع الحقوق محفوظة
        </p>
      </div>
    </footer>
  )
}
