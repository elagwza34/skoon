export default function AboutSection() {
  const ABOUT_IMG =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAecXE2kjXxhTvLwZAgxRKOzafTCT8PIKcDU__D-GOe8KiXa2rs8oKXnomVhyvEe54dWxPY8fozb-2ol2F2Qp42ufOa7L4eeiIUAv7w1xcNldQw3wGA9NTerbdtizjFdZl7CDlyg8lD5rRTBTzyH1nFeyDAXl8CmZeRpPExsmXJhGpHSU-Zo17Bx31p_u9c8LCQ6zO-IqLJ9Kp54nbBszDrDq9k1pa4oEKJYr_NRI4q'

  return (
    <section className="py-[3.5rem] bg-[#fff9ef]" id="about">
      <div className="max-w-7xl mx-auto px-[1rem] lg:px-[3rem]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-[3.5rem] items-center">
          {/* Left Image */}
          <div className="lg:col-span-6 relative">
            <div className="relative rounded-[0.5rem] overflow-hidden shadow-2xl bg-[#241B17] aspect-[4/3]">
              <div
                className="w-full h-full bg-cover bg-center"
                style={{
                  backgroundImage: `url(${ABOUT_IMG})`,
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#241B17]/80 via-transparent to-transparent" />
              <div className="absolute bottom-6 right-6 left-6 p-4 rounded-xl bg-[#1A1310]/80 backdrop-blur-md shadow-md text-[#FFFCF8]">
                <p className="text-[22px] text-[#B98757] mb-1 font-sans font-medium">
                  جلسات دافئة
                </p>
                <p className="text-[13px] text-[#D8C5AD] font-sans">
                  مكان صُمم ليكون وجهتك المفضلة للصفاء والراحة النفسية.
                </p>
              </div>
            </div>
            {/* Decorative Badge */}
            <div className="hidden sm:flex absolute -top-6 -left-6 w-24 h-24 rounded-full bg-[#B98757] text-[#1A1310] items-center justify-center p-3 text-center shadow-xl rotate-6">
              <span className="text-[10px] font-bold uppercase leading-tight font-sans">
                قهوة &amp;<br />
                سكون
              </span>
            </div>
          </div>

          {/* Right Info */}
          <div className="lg:col-span-6 flex flex-col gap-[1.25rem]">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-[rgba(212,175,55,0.18)] text-[#B98757] text-sm font-medium font-sans">
              <span>عن سكون كافيه</span>
            </div>
            <h2 className="text-[40px] font-bold text-[#241B17] font-sans">
              أهلًا بيك في سكون
            </h2>
            <p className="text-[17px] text-[#4e4541] leading-relaxed font-sans">
              في سكون، بنؤمن إن أجمل اللحظات بتبدأ من مكان مريح، وقعدة حلوة، وتفاصيل بسيطة
              بتفرق. سواء جاي تستمتع بقهوتك، أو تقضي وقت مع أصحابك، هتلاقي مساحة تخليك تعيش
              اللحظة.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[1rem] pt-[0.75rem]">
              {[
                {
                  icon: 'spa',
                  title: 'أجواء مريحة',
                  desc: 'هدوء وانعزال مدروس عن ضجيج الحياة والزحمة.',
                },
                {
                  icon: 'local_cafe',
                  title: 'مشروبات متنوعة',
                  desc: 'حبوب قهوة نقية ومشروبات مصممة بإتقان تام.',
                },
                {
                  icon: 'auto_awesome',
                  title: 'لحظات مميزة',
                  desc: 'مساحة تحتضن ضحكاتك وتشاركك أحلى الذكريات.',
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="p-[1rem] rounded-[0.5rem] bg-[#f9f3ea] shadow-sm flex flex-col items-start gap-[0.375rem] transition-transform hover:-translate-y-1"
                >
                  <div className="w-10 h-10 rounded-lg bg-[rgba(212,175,55,0.18)] flex items-center justify-center text-[#B98757]">
                    <span className="material-symbols-outlined text-2xl">
                      {feature.icon}
                    </span>
                  </div>
                  <h3 className="text-[14px] font-bold text-[#241B17] font-sans">
                    {feature.title}
                  </h3>
                  <p className="text-[13px] text-[#4e4541] font-sans">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}