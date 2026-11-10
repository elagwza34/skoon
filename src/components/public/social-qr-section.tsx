export default function SocialQRSection() {
  const platforms = [
    {
      name: 'فيسبوك',
      icon: 'thumb_up',
      desc: 'تابع صفحتنا وأحدث أخبارنا',
      link: 'https://web.facebook.com/profile.php?id=61594909603821',
      qrNote: 'امسح الكود للVisit صفحتنا',
      qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://web.facebook.com/profile.php?id=61594909603821',
    },
    {
      name: 'إنستغرام',
      icon: 'camera',
      desc: 'شوف أجمل لقطاتنا ويومياتنا',
      link: '#',
      qrNote: 'سيتم إضافة الكود قريبًا',
    },
    {
      name: 'تيك توك',
      icon: 'music_video',
      desc: 'شاهد فيديوهاتنا ولحظات التحضير',
      link: '#',
      qrNote: 'سيتم إضافة الكود قريبًا',
    },
    {
      name: 'واتساب',
      icon: 'chat',
      desc: 'تواصل معنا واستفسر عن الحجوزات',
      link: 'https://wa.me/',
      qrNote: 'سيتم إضافة الكود قريبًا',
    },
    {
      name: 'واي فاي سكون',
      icon: 'wifi',
      desc: 'اتصل بالشبكة بسرعة وسهولة',
      link: '#',
      qrNote: 'الشبكة: Sokoon_Guest',
      extra: 'مجانًا لزوارنا',
    },
  ]

  return (
    <section className="py-[3.5rem] bg-[#ede7de]">
      <div className="w-full px-[1rem] lg:px-[3rem]">
        <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
          <span className="text-sm text-[#B98757] tracking-wider font-sans font-semibold">
            تواصل سريع وسلس
          </span>
          <h2 className="text-[40px] font-bold text-[#241B17] font-sans">
            تابع سكون على كل المنصات
          </h2>
          <p className="text-[17px] text-[#4e4541] font-sans">
            امسح الكود وخلّيك دايمًا قريب من سكون، عروضنا ولحظاتنا المميزة.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-[1rem]">
          {platforms.map((p) => (
            <div
              key={p.name}
              className="p-[1rem] rounded-[0.5rem] bg-[#FFFCF8] shadow-md flex flex-col items-center text-center"
            >
              <div className="w-10 h-10 rounded-full bg-[rgba(212,175,55,0.18)] flex items-center justify-center text-[#B98757] mb-2">
                <span className="material-symbols-outlined text-xl">{p.icon}</span>
              </div>
              <h3 className="text-[14px] font-bold text-[#241B17] mb-1 font-sans">
                {p.name}
              </h3>
              <p className="text-[13px] text-[#4e4541] mb-3 font-sans">{p.desc}</p>
              <div className="w-36 h-36 p-3 bg-white rounded-xl shadow-inner flex flex-col items-center justify-center mb-3">
                {p.qrImage ? (
                  <img
                    src={p.qrImage}
                    alt={`QR Code for ${p.name}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <svg
                    className="w-full h-full text-[#241B17]"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14-2h4v2h-4v-2zm-4 0h2v4h-2v-4zm2 4h4v4h-4v-4zm-2 2h2v2h-2v-2zm4-6h2v2h-2v-2zM6 6h2v2H6V6zm12 0h2v2h-2V6zm-12 12h2v2H6v-2z"></path>
                  </svg>
                )}
              </div>
              <span className="text-[10px] text-[#4e4541] mb-2 font-sans block">
                {p.qrNote}
              </span>
              {p.extra && (
                <span className="text-[14px] text-[#241B17] font-sans font-semibold block">
                  {p.extra}
                </span>
              )}
              <a
                href={p.link}
                target={p.link === 'https://wa.me/' ? '_blank' : undefined}
                rel={p.link === 'https://wa.me/' ? 'noopener' : undefined}
                className="text-sm text-[#B98757] hover:underline font-semibold font-sans"
              >
                {p.link === 'https://wa.me/' ? 'محادثة واتساب' : 'زيارة الصفحة'}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}