import Image from 'next/image'
import QRCode from 'qrcode'

import { PublicIcon } from '@/components/public/public-icon'
export default async function SocialQRSection() {
  const platforms = [
    {
      name: 'فيسبوك',
      icon: 'thumb_up',
      desc: 'تابع صفحتنا وأحدث أخبارنا',
      link: 'https://web.facebook.com/profile.php?id=61594909603821',
      qrNote: 'امسح الكود لزيارة صفحتنا',
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
      link: 'https://www.tiktok.com/@sokoon.caf?_r=1&_t=ZS-9BH9P668Tpd',
      qrNote: 'امسح الكود لمتابعتنا على تيك توك',
      qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://www.tiktok.com/@sokoon.caf?_r=1&_t=ZS-9BH9P668Tpd',
    },
    {
      name: 'واتساب',
      icon: 'chat',
      desc: 'تواصل معنا واستفسر عن الحجوزات',
      link: 'https://wa.me/',
      qrNote: 'سيتم إضافة الكود قريبًا',
      showQr: false,
    },
    {
      name: 'واي فاي סكون',
      icon: 'wifi',
      desc: 'اتصل بالشبكة بسرعة وسهولة',
      link: '#',
      qrNote: 'الشبكة: Sokoon_Guest',
      extra: 'مجانًا لزوارنا',
      showQr: false,
    },
  ]

  for (const platform of platforms) {
    if (platform.qrImage) platform.qrImage = await QRCode.toDataURL(platform.link, { width: 200, margin: 2 })
  }

  return (
    <section className="py-[3.5rem] bg-[#ede7de]">
      <div className="w-full px-[1rem] lg:px-[3rem]">
        <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
          <span className="text-sm text-[#805329] tracking-wider font-sans font-semibold">
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
              <div className="w-10 h-10 rounded-full bg-[rgba(212,175,55,0.18)] flex items-center justify-center text-[#805329] mb-2">
                <PublicIcon symbol={p.icon} className="text-xl" />
              </div>
              <h3 className="text-[14px] font-bold text-[#241B17] mb-1 font-sans">
                {p.name}
              </h3>
              <p className="text-[13px] text-[#4e4541] mb-3 font-sans">{p.desc}</p>
              {p.showQr !== false && (
                <div className="w-36 h-36 p-3 bg-white rounded-xl shadow-inner flex flex-col items-center justify-center mb-3">
                  {p.qrImage ? (
                    <Image src={p.qrImage} alt={`رمز QR لصفحة ${p.name}`} width={144} height={144} unoptimized className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-center text-sm text-[#4e4541]">رمز QR غير متاح بعد</span>
                  )}
                </div>
              )}
              <span className="text-[10px] text-[#4e4541] mb-2 font-sans block">
                {p.qrNote}
              </span>
              {p.extra && (
                <span className="text-[14px] text-[#241B17] font-sans font-semibold block">
                  {p.extra}
                </span>
              )}
              {p.link !== '#' ? <a
                href={p.link}
                target={p.link === 'https://wa.me/' ? '_blank' : undefined}
                rel={p.link === 'https://wa.me/' ? 'noopener' : undefined}
                className="text-sm text-[#805329] hover:underline font-semibold font-sans"
              >
                {p.link === 'https://wa.me/' ? 'محادثة واتساب' : 'زيارة الصفحة'}
              </a> : <span className="text-sm text-[#4e4541]">{p.icon === 'wifi' ? 'اطلب كلمة المرور من الفريق' : 'قريبًا'}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}