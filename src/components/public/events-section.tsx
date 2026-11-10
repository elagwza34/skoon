export default function EventsSection() {
  const events = [
    {
      label: 'موسيقى هادئة',
      time: 'كل خميس ٨ م',
      icon: 'music_note',
      title: 'أمسية موسيقية',
      desc: 'عزف منفرد على العود والبيانو ينقلك لأجواء من السحر والسكون العميق.',
      tag: 'جلسات استرخاء',
    },
    {
      label: 'تسلية ومرح',
      time: 'كل ثلاثاء ٧ م',
      icon: 'casino',
      title: 'ليلة ألعاب وتحديات',
      desc: 'ألعاب لوحية (Board Games) وتحديات خفيفة تضيف البهجة على قعدتك.',
      tag: 'مشاركة حماسية',
    },
    {
      label: 'لقاءات ودية',
      time: 'كل جمعة ٥ م',
      icon: 'groups',
      title: 'تجمعات الأصدقاء',
      desc: 'عروض مميزة للكروبات وقعدات مهيأة لتجمع أحلى شلة مع مشروباتكم المفضلة.',
      tag: 'خصومات للكروبات',
    },
    {
      label: 'مفاجآت المواسم',
      time: 'شهريًا',
      icon: 'celebration',
      title: 'فعاليات موسمية',
      desc: 'احتفالات بالأعياد، ليالي رمضانية دافئة، وتجارب خاصة في كل مناسبة.',
      tag: 'تجارب حصرية',
    },
  ]

  return (
    <section className="py-[3.5rem] bg-[#f9f3ea]" id="events">
      <div className="w-full px-[1rem] lg:px-[3rem]">
        <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
          <span className="text-sm text-[#B98757] tracking-wider font-sans font-semibold">
            برنامجنا الترفيهي
          </span>
          <h2 className="text-[40px] font-bold text-[#241B17] font-sans">
            فعاليات سكون
          </h2>
          <p className="text-[17px] text-[#4e4541] font-sans">
            كل يوم ممكن يكون ليه حكاية مختلفة وروح جديدة بتجمعنا.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[1rem]">
          {events.map((ev) => (
            <div
              key={ev.title}
              className="p-[1rem] rounded-[0.5rem] bg-[#FFFCF8] shadow-md flex flex-col justify-between transition-all duration-300 hover:shadow-xl"
            >
              <div>
                <div className="flex items-center justify-between mb-[0.75rem]">
                  <span className="px-3 py-1 rounded-full bg-[rgba(212,175,55,0.18)] text-[#B98757] text-[10px] font-sans font-semibold">
                    {ev.label}
                  </span>
                  <span className="text-[10px] text-[#4e4541] font-sans">{ev.time}</span>
                </div>
                <div className="w-12 h-12 rounded-[0.5rem] bg-[#f3ede4] flex items-center justify-center text-[#241B17] mb-[0.75rem]">
                  <span className="material-symbols-outlined text-2xl text-[#B98757]">
                    {ev.icon}
                  </span>
                </div>
                <h3 className="text-[18px] font-bold text-[#241B17] mb-2 font-sans">
                  {ev.title}
                </h3>
                <p className="text-[13px] text-[#4e4541] leading-relaxed font-sans">
                  {ev.desc}
                </p>
              </div>
              <div className="pt-[0.75rem] mt-[0.75rem]">
                <span className="text-[10px] text-[#B98757] font-sans font-semibold block">
                  {ev.tag}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-[1rem] text-center">
          <span className="text-[13px] text-[#4e4541]/70 italic font-sans">
            * المواعيد تقريبية ويتم تأكيدها عبر قنوات التواصل الاجتماعي أسبوعيًا.
          </span>
        </div>
      </div>
    </section>
  )
}