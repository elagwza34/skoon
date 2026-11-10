'use client'

import { useState } from 'react'
import { GALLERY_IMAGES } from './gallery-data'

export default function GallerySection() {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [selectedImg, setSelectedImg] = useState('')

  return (
    <>
      <section className="py-[3.5rem] bg-[#F6F0E7]" id="gallery">
        <div className="max-w-7xl mx-auto px-[1rem] lg:px-[3rem]">
          <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
            <span className="text-sm text-[#B98757] tracking-wider font-sans font-semibold">
              لقطات من واقعنا
            </span>
            <h2 className="text-[40px] font-bold text-[#241B17] font-sans">
              لحظات من سكون
            </h2>
            <p className="text-[17px] text-[#4e4541] font-sans">
              تفاصيل صغيرة بتصنع ذكريات كبيرة ودافئة.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[0.75rem]">
            {GALLERY_IMAGES.map((img) => (
              <div
                key={img.src}
                className={`group relative rounded-[0.5rem] overflow-hidden ${img.h} ${img.mdH ?? ''} bg-[#1A1310] cursor-pointer shadow-md`}
                onClick={() => {
                  setSelectedImg(img.src)
                  setLightboxOpen(true)
                }}
              >
                <div
                  className="w-full h-full bg-cover bg-center group-hover:scale-110 transition-transform duration-500"
                  style={{ backgroundImage: `url(${img.src})` }}
                />
                <div className="absolute inset-0 bg-[#1A1310]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[#FFFCF8]">
                  <span className="material-symbols-outlined text-3xl text-[#B98757]">
                    zoom_in
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      <div
        className={`fixed inset-0 z-50 bg-[#1A1310]/95 backdrop-blur-md flex items-center justify-center p-4 ${
          lightboxOpen ? '' : 'hidden'
        }`}
        onClick={() => setLightboxOpen(false)}
      >
        <button
          className="absolute top-6 left-6 text-[#FFFCF8] hover:text-[#B98757] transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setLightboxOpen(false)
          }}
          type="button"
        >
          <span className="material-symbols-outlined text-3xl">close</span>
        </button>
        <div
          className="max-w-[56rem] max-h-[85vh] w-full h-full rounded-[0.5rem] overflow-hidden shadow-2xl relative flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full h-full bg-contain bg-no-repeat bg-center"
            style={{ backgroundImage: `url(${selectedImg})` }}
          />
        </div>
      </div>
    </>
  )
}