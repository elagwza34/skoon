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
          <img src={LOGO} alt="سكون كافيه" className="h-12 w-auto object-contain" />
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
          {['camera', 'public', 'alternate_email'].map((icon) => (
            <a
              key={icon}
              href="#"
              className="w-9 h-9 rounded-full bg-[#241b17] flex items-center justify-center text-[#D8C5AD] hover:text-[#D4AF37] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
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
