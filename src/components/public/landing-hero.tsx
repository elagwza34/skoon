import Image from 'next/image'

const HERO_BG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBVy34FIu4yX_wtCo_vlOZfHH3A3HwLEf1Oi5gVU8oi4LMetBoql4C821LIzCuXTpt_uPogDci64nZT_99L8b4K5P-QSKU_L6fdIj2xdB8XBNmxJsxcFTXL8IjZjfdsexiIRLqy4sYU6gIY2dhAX5MQUp0del2geOWizmZFMrpuEHHVgtrASsu1lsOUxpWBa4YVwQFUQtAocx851cfBjAi2gtxtsI260OnlTDbj_FLz'

const LOGO_BADGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB_0ZoHblLkyuREK4mZGaJqK3XkF4aoT_E7MOgK2DtOy414AoFQrsoInVALeWfwMH3rTyXdZkYvViRretD5rNLUv6pWo3elnkPf0Lj-QLLM44gpANuxcUF9UGYG2i_aeBMHgGgfVGEVZTy7o_5rWBtKRk1jEkSuAvanRU7niHzVtfwPjRgT_bRpiuLNW3yu99vkTMD-eaxIu3R8BqzDcGmW5fG4wQKDFzmbuVzXXmSAXniBKleghqEA3g'

export default function LandingHero() {
  return (
    <section
      className="relative -mt-20 w-full min-h-[92vh] flex items-center justify-center overflow-hidden bg-[#1A1310]"
      id="hero"
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 scale-105 transition-transform duration-1000"
        style={{ backgroundImage: `url(${HERO_BG})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1310] via-[#1A1310]/70 to-[#1A1310]/40" />

      <div className="relative z-10 max-w-5xl mx-auto px-[1rem] lg:px-[3rem] text-center pt-28 pb-16 flex flex-col items-center">
        <div className="mb-[1.25rem] inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f3ede4]/10 backdrop-blur-md shadow-sm">
          <Image src={LOGO_BADGE} alt="سكون كافيه" className="w-6 h-6 object-contain" />
          <span className="text-xs text-[#B98757] tracking-wider uppercase font-sans">
            ملاذك الهادئ في قلب المدينة
          </span>
        </div>
        <h1 className="text-40px lg:text-[56px] leading-[52px] lg:leading-[68px] font-bold text-[#FFFCF8] mb-[1.25rem] max-w-[40rem]">
          سكون.. مساحتك من الهدوء
        </h1>
        <p className="text-[17px] text-[#D8C5AD] max-w-[32rem] mx-auto mb-[3.5rem] font-light leading-relaxed">
          لحظات تستحق تعيشها، وقهوة تكمّل تفاصيل يومك. تجربة هادئة تجمع بين القهوة المختصة والمشاعر الدافئة.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-[1rem] w-full">
          <a
            href="#menu"
            className="px-8 py-3.5 rounded-full bg-[#B98757] text-[#1A1310] text-sm font-semibold hover:bg-[#D4AF37] transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(212,175,55,0.18)] flex items-center gap-2"
          >
            <span>استكشف المنيو</span>
            <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
          </a>
          <a
            href="#about"
            className="px-8 py-3.5 rounded-full bg-[#FFFCF8]/10 text-[#FFFCF8] text-sm font-medium hover:bg-[#FFFCF8]/20 backdrop-blur-md transition-all duration-300 flex items-center gap-2"
          >
            <span>اكتشف سكون</span>
            <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
          </a>
        </div>
        <a
          href="#about"
          className="mt-[3.5rem] flex flex-col items-center gap-1 text-[#D8C5AD]/70 hover:text-[#B98757] transition-colors group"
        >
          <span className="text-[10px] tracking-widest font-sans">انزل للأسفل</span>
          <span className="material-symbols-outlined text-2xl group-hover:translate-y-1 transition-transform animate-bounce">
            expand_more
          </span>
        </a>
      </div>
    </section>
  )
}
