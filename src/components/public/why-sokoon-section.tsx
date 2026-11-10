export default function WhySokoonSection() {
  const features = [
    {
      icon: 'nightlight',
      title: 'أجواء مريحة',
      desc: 'إضاءة مدروسة وموسيقى ناعمة عشان تفصل من كل دوشة الدنيا وتستمتع بوقتك في هدوء.',
    },
    {
      icon: 'coffee',
      title: 'مشروبات لكل مزاج',
      desc: 'من الإسبريسو المركز لعصائر الصيف المنعشة، كل اختيار متقن عشان يرضي ذوقك تمامًا.',
    },
    {
      icon: 'favorite',
      title: 'وقت أحلى مع أصحابك',
      desc: 'جلسات واسعة وتوزيع مريح يخلي حكاياتكم تدوم وتكون أحلى وأدفى وسط ضيافتنا الكريمة.',
    },
    {
      icon: 'verified',
      title: 'تفاصيل تستحق التجربة',
      desc: 'جودة المكونات، الخدمة السريعة بابتسامة، والاهتمام بأدق رغباتكم دائمًا في أولوياتنا.',
    },
  ]

  return (
    <section className="py-[3.5rem] bg-[#fff9ef]">
      <div className="max-w-7xl mx-auto px-[1rem] lg:px-[3rem]">
        <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
          <span className="text-sm text-[#B98757] tracking-wider font-sans font-semibold">
            سر تميزنا
          </span>
          <h2 className="text-[40px] font-bold text-[#241B17] font-sans">ليه سكون؟</h2>
          <p className="text-[17px] text-[#4e4541] font-sans">
            لأن التفاصيل هي اللي بتفرق، بنينا كل ركن بحب وذوق عالي.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[1rem]">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-[2rem] rounded-[0.5rem] bg-[#FFFCF8] shadow-md flex flex-col items-center text-center transition-transform hover:-translate-y-2 duration-300"
            >
              <div className="w-16 h-16 rounded-full bg-[rgba(212,175,55,0.18)] flex items-center justify-center text-[#B98757] mb-[0.75rem]">
                <span className="material-symbols-outlined text-3xl">{f.icon}</span>
              </div>
              <h3 className="text-[18px] font-bold text-[#241B17] mb-2 font-sans">
                {f.title}
              </h3>
              <p className="text-[13px] text-[#4e4541] leading-relaxed font-sans">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}