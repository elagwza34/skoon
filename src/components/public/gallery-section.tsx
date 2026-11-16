'use client'

import { PublicIcon } from '@/components/public/public-icon'

import Image from 'next/image'
import { Modal } from '@/components/ui/modal'
import { Icon } from '@/components/ui/icon'
import { useState } from 'react'
import { GALLERY_IMAGES } from './gallery-data'

export default function GallerySection() {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [selectedImg, setSelectedImg] = useState<(typeof GALLERY_IMAGES)[number] | null>(null)

  return (
    <>
      <section className="py-[3.5rem] bg-[#F6F0E7]" id="gallery">
        <div className="w-full px-[1rem] lg:px-[3rem]">
          <div className="text-center max-w-[32rem] mx-auto mb-[3.5rem] flex flex-col items-center gap-[0.375rem]">
            <span className="text-sm text-[#805329] tracking-wider font-sans font-semibold">
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
              <button
                type="button" aria-label={`عرض الصورة: ${img.alt}`}
                key={img.src}
                className={`group relative rounded-[0.5rem] overflow-hidden ${img.h} ${img.mdH ?? ''} bg-[#1A1310] cursor-pointer shadow-md`}
                onClick={() => {
                  setSelectedImg(img)
                  setLightboxOpen(true)
                }}
              >
                <Image src={img.src} alt={img.alt} fill sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-[#1A1310]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[#FFFCF8]">
                  <PublicIcon symbol={'zoom_in'} className="text-3xl text-[#805329]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxOpen && selectedImg && <Modal aria-label={selectedImg.alt} onClose={() => setLightboxOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1310]/95 p-4 text-white">
        <button className="absolute start-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded bg-black/60" aria-label="إغلاق الصورة" onClick={() => setLightboxOpen(false)}><Icon name="close" size={24} /></button>
        <div className="relative h-[80dvh] w-full max-w-4xl">
          <Image src={selectedImg.src} alt={selectedImg.alt} fill sizes="(min-width: 1024px) 896px, 100vw" className="object-contain" />
        </div>
      </Modal>}
    </>
  )
}
