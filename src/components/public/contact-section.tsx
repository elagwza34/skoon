import { CONTACT_PIN_IMG } from './contact-data'

export default function ContactSection() {
  return (
    <section className="py-[3.5rem] bg-[#241B17]" id="contact">
      <div className="w-full px-[1rem] lg:px-[3rem]">
        <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
          <span className="text-sm text-[#B98757] tracking-wider font-sans font-semibold">
            نحن بانتظارك
          </span>
          <h2 className="text-[40px] font-bold text-[#FFFCF8] font-sans">
            مستنيينك في سكون
          </h2>
          <p className="text-[17px] text-[#D8C5Ad] font-sans">
            تعالى عيش التجربة بنفسك وشاركنا أحلى لحظات يومك.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-[3.5rem] items-stretch">
          {/* Right: Info & Actions */}
          <div className="lg:col-span-6 flex flex-col justify-between p-[2rem] rounded-[0.5rem] bg-[#FFFCF8] shadow-lg">
            <div className="flex flex-col gap-[1.25rem]">
              <div className="flex items-start gap-[0.75rem]">
                <div className="w-12 h-12 rounded-[0.5rem] bg-[rgba(212,175,55,0.18)] flex items-center justify-center text-[#B98757] shrink-0">
                  <span className="material-symbols-outlined text-2xl">location_on</span>
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#241B17] mb-1 font-sans">
                    العنوان والموقع
                  </h3>
                  <p className="text-[15px] text-[#4e4541] font-sans">
                    طنطا شارع حسن حسيب بجوار الكموني للسيارات، مصر.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-[0.75rem]">
                <div className="w-12 h-12 rounded-[0.5rem] bg-[rgba(212,175,55,0.18)] flex items-center justify-center text-[#B98757] shrink-0">
                  <span className="material-symbols-outlined text-2xl">call</span>
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#241B17] mb-1 font-sans">
                    أرقام التواصل
                  </h3>
                  <p className="text-[15px] text-[#4e4541] font-sans" dir="ltr">
                    01500379339
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-[0.75rem]">
                <div className="w-12 h-12 rounded-[0.5rem] bg-[rgba(212,175,55,0.18)] flex items-center justify-center text-[#B98757] shrink-0">
                  <span className="material-symbols-outlined text-2xl">schedule</span>
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#241B17] mb-1 font-sans">
                    مواعيد العمل
                  </h3>
                  <p className="text-[15px] text-[#4e4541] font-sans">
                    يوميًا من ٨:٠٠ صباحًا حتى ١:٠٠ بعد منتصف الليل.
                  </p>
                  <p className="text-[13px] text-[#B98757] mt-0.5 font-sans">
                    في عطلات نهاية الأسبوع حتى ٢:٠٠ صباحًا.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-[0.75rem] mt-[3rem] pt-[0.75rem]">
              <a
                href="https://wa.me/"
                target="_blank"
                rel="noopener"
                className="flex-1 min-w-[160px] py-3.5 px-6 rounded-full bg-[#241B17] text-[#FFFCF8] text-sm font-semibold hover:bg-[#B98757] hover:text-[#241B17] transition-all duration-300 shadow-md text-center flex items-center justify-center gap-2 font-sans"
              >
                <span className="material-symbols-outlined text-xl">chat</span>
                <span>تواصل واتساب</span>
              </a>
              <a
                href="https://maps.app.goo.gl/vX1vCK9Jm7nB8sc16"
                target="_blank"
                rel="noopener"
                className="flex-1 min-w-[160px] py-3.5 px-6 rounded-full bg-[rgba(212,175,55,0.18)] text-[#241B17] text-sm font-semibold hover:bg-[#B98757]/30 transition-all duration-300 shadow-sm text-center flex items-center justify-center gap-2 font-sans"
              >
                <span className="material-symbols-outlined text-xl">directions</span>
                <span>الاتجاهات في الخريطة</span>
              </a>
            </div>
          </div>

          {/* Left: Map (Interactive Google Maps iframe) */}
          <div className="lg:col-span-6 rounded-[0.5rem] overflow-hidden shadow-lg min-h-[380px] h-full relative">
            <iframe
              className="w-full h-full min-h-[380px]"
              title="موقع سكون كافيه"
              src="https://www.google.com/maps?q=%D8%B7%D9%86%D8%B7%D8%A7+%D8%B4%D8%A7%D8%B1%D8%B9+%D8%AD%D8%B3%D9%86+%D8%AD%D8%B3%D9%8A%D8%A8+%D8%A8%D8%AC%D9%88%D8%A7%D8%B1+%D8%A7%D9%84%D9%83%D9%85%D9%88%D9%86%D9%8A+%D9%84%D9%84%D8%B3%D9%8A%D8%A7%D8%B1%D8%A7%D8%AA&output=embed"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="absolute bottom-4 right-4 bg-[#1A1310]/90 backdrop-blur-md p-3 rounded-xl shadow-md text-[#FFFCF8] flex items-center gap-3">
              <img src={CONTACT_PIN_IMG} alt="سكون" className="w-8 h-8 object-contain" />
              <div>
                <p className="text-[14px] font-bold text-[#B98757] font-sans">
                  موقع سكون كافيه
                </p>
                <p className="text-[10px] text-[#D8C5AD] font-sans">
                  سهولة الوصول مع مواقف سيارات متاحة
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}