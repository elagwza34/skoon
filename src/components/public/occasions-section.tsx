export default function OccasionsSection() {
  const occasions = [
    {
      num: '01',
      title: 'أعياد الميلاد',
      desc: 'خلي يومك المميز مليان لحظات حلوة وذكريات تفضل معاك طول العمر مع أحبابك.',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDn3E5VI2YUJU0kNSE4WYpuCbHiWGUWKDG7eg92S_SuG2Bc4kRTTar54FebNzgNYz0zyTWBY7ONxd2I72DGNOiFivxOYVCr1E6lOuRURCmqOfWZNyzPJ7vwENc3Akyy-WaVE3AEFnd-zNKD3tZNqfp67rP1sWXZokvFoCwrc04UlRDorcg5v7CdaNrCR37J_qc2-yl7tyoLzNSO7a1emNHcu64b1j4qA8lT93XQ8tbw',
    },
    {
      num: '02',
      title: 'تجمعات الأصدقاء',
      desc: 'القعدة الحلوة بتبدأ بالمكان الصح والناس اللي بتحبهم في أجواء مريحة وممتعة.',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAhG03SajfGmf3cSPJiCv1JGLyuY7hAzhwINPoGBcSXJEZx7uiPM83bEuCVgrW0DSEhfrwdbEPhbbwvLS92PEbeO84XQhObmX8ux4e_M_LyrW7eISn-z9YRur3XFQgNu33krtO2tLBxCT5VTgXcoeyF4GMaqfgjKvscL5x24kmVMSclkJ9T3UrmT41cc-22fQsLmykngQ1t7zVchUyAs9zRoidDOJvx6Dqe6tgjFJuH',
    },
    {
      num: '03',
      title: 'المناسبات الخاصة',
      desc: 'كل مناسبة ليها تفاصيلها، وكل لحظة تستاهل تتعاش برقي وخصوصية تليق بيك.',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBwxxbcVO7OnHddoFi5Ncf5rA7ftdNe0FQWfpUGm48R-J1IzCJBy3cWVauXjH589x7_vGIO8ZBJn-ncHAi-IV-HakA382NHXya45-bSn3twtp4Ikg-TdjXIafsVnqVTKLeYUTVW0m1r2TVfva21WPgqGmdwseYqSHrxtuWKPoOtls555ydaytRED3TjUwznYp6GO0RuhakTojKQ49yRpnolwffJ7aCFyFiXybrsganw',
    },
    {
      num: '04',
      title: 'الاحتفالات البسيطة',
      desc: 'مش لازم المناسبة تكون كبيرة علشان تبقى مميزة، فرحتك البسيطة تهمنا ونحتفل بيها معاك.',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDobUvN7kves0BzhJt60lfoUnm7ZbbKrREZyLUQLK4WMeWqvpbuhvW043fwXQxef5IiqGWa9z_u3-Lk4SuYT4UBitvSL8Zggs4WdEKAjbFP05Zf1NGv5WCe2d0VTTEPiTuBXdNSrplWyBCGQDEcNHb9puQEH1RjxD1pSOPXxB9ULvW3V0e9cccO4346PTm05APfa_3rAzUyUQvDwtw44BXhpT0sTc_UpMqan8Ij4Rel',
    },
  ]

  return (
    <section className="py-[3.5rem] bg-[#241B17]" id="occasions">
      <div className="w-full px-[1rem] lg:px-[3rem]">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-[3.5rem] gap-[0.75rem]">
          <div>
            <span className="text-sm text-[#B98757] tracking-wider font-sans font-semibold">
              لحظات لا تُنسى
            </span>
            <h2 className="text-[40px] font-bold text-[#FFFCF8] mt-1 font-sans">
              مناسباتك أحلى في سكون
            </h2>
            <p className="text-[17px] text-[#D8C5AD] mt-2 max-w-[32rem] font-sans">
              لحظات خاصة تستاهل مكان مميز يوفر لك كل سبل الراحة والخصوصية.
            </p>
          </div>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#241B17] text-[#FFFCF8] text-sm font-md font-semibold hover:bg-[#B98757] hover:text-[#241B17] transition-all duration-300 shadow-md font-sans"
          >
            <span>تواصل معنا لحجز مناسبتك</span>
            <span className="material-symbols-outlined text-[18px]">calendar_today</span>
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[1rem]">
          {occasions.map((occ) => (
            <div
              key={occ.title}
              className="relative group rounded-[0.5rem] overflow-hidden shadow-lg h-[384px] bg-[#1A1310]"
            >
              <div
                className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url(${occ.image})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#241B17] via-[#241B17]/60 to-transparent" />
              <div className="absolute inset-0 p-[1rem] flex flex-col justify-end text-[#FFFCF8]">
                <span className="w-8 h-8 rounded-full bg-[#B98757]/90 text-[#241B17] flex items-center justify-center mb-2 font-bold text-xs font-sans">
                  {occ.num}
                </span>
                <h3 className="text-[22px] font-bold text-[#FFFCF8] mb-1 font-sans">
                  {occ.title}
                </h3>
                <p className="text-[13px] text-[#D8C5AD] line-clamp-3 font-sans">
                  {occ.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}