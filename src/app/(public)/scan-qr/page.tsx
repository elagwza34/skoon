'use client'

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import Link from 'next/link'

export default function ScanQRPage() {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const qrcodeRef = useRef<Html5Qrcode | null>(null)
  const elementIdRef = useRef<string>('reader')

  useEffect(() => {
    const id = `qr-reader-${Date.now()}`
    elementIdRef.current = id
    return () => {
      if (qrcodeRef.current) {
        qrcodeRef.current.stop().catch(() => {})
      }
    }
  }, [])
  const startScanning = async () => {
    setError(null)
    setScanResult(null)
    try {
      qrcodeRef.current = new Html5Qrcode(elementIdRef.current!)
      await qrcodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: 250,
        },
        (decodedText: string) => {
          setScanResult(decodedText)
          setScanning(false)
          qrcodeRef.current?.stop()
        },
        (errorMessage: string) => {
          // تجاهل أخطاء المسح العادية أثناء المحاولة
        }
      )
      setScanning(true)
    } catch (err) {
      setError('تعذر فتح الكاميرا. يرجى منح إذن الوصول للكاميرا.')
      console.error(err)
    }
  }

  const stopScanning = async () => {
    if (qrcodeRef.current) {
      await qrcodeRef.current.stop()
      setScanning(false)
    }
  }

  const restartScanning = () => {
    setScanResult(null)
    setError(null)
    startScanning()
  }

  const goToOrder = () => {
    const text = scanResult?.trim()
    if (!text) {
      window.location.href = '/order-type'
      return
    }
    try {
      const u = new URL(text)
      const m = u.pathname.match(/^\/menu\/([0-9a-f]{16})$/i)
      if (m) {
        window.location.href = `/menu/${m[1]}`
        return
      }
    } catch {
      // not an absolute URL
    }
    const pathMatch = text.match(/\/menu\/([0-9a-f]{16})/i)
    if (pathMatch) {
      window.location.href = `/menu/${pathMatch[1]}`
      return
    }
    if (/^[0-9a-f]{16}$/i.test(text)) {
      window.location.href = `/menu/${text}`
      return
    }
    window.location.href = '/order-type'
  }

  return (
    <div className="min-h-dvh w-full bg-[#241B17] text-[#FFFCF8] font-sans" dir="rtl" lang="ar">
      <header className="fixed top-0 w-full z-50 bg-transparent">
        <div className="h-20 w-full px-[1rem] lg:px-[3rem] flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-[#FFFCF8] text-xl font-semibold tracking-wide"
          >
            سكون كافيه
          </Link>
        </div>
      </header>

      <main className="pt-24 w-full flex flex-col items-center justify-center p-[1rem] lg:p-[3rem]">
        <div className="max-w-[32rem] w-full text-center space-y-6">
          <h1 className="text-[40px] font-bold text-[#B98757] font-sans mb-2">
            مسح رمز QR
          </h1>
          <p className="text-[#D8C5AD] text-[17px] font-light">
            يرجى توجيه الكاميرا نحو رمز QR على طاولتك لبدء الطلب.
          </p>

          <div
            id={elementIdRef.current!}
            className="w-full max-w-[400px] mx-auto aspect-square rounded-[1rem] border-2 border-[#B98757] bg-[#1A1310] overflow-hidden shadow-2xl relative"
          />

          {error && (
            <div className="p-4 rounded-[0.5rem] bg-[#ba1a1a]/20 border border-[#ba1a1a] text-[#ffdad6] text-sm font-sans">
              {error}
              <button
                onClick={startScanning}
                className="mt-2 text-sm text-[#B98757] underline hover:text-[#D4AF37]"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {!scanning && !error && !scanResult && (
            <button
              onClick={startScanning}
              className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#B98757] text-[#241B17] font-semibold hover:bg-[#D4AF37] transition-all duration-300 shadow-lg"
            >
              <span className="material-symbols-outlined text-[18px]">camera_alt</span>
              <span>تشغيل الكاميرا</span>
            </button>
          )}

          {scanning && !scanResult && !error && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="h-4 w-4 rounded-full border-2 border-[#B98757] border-t-transparent animate-spin" />
              <span className="text-[#D8C5AD] text-sm font-sans">جاري المسح...</span>
              <button
                onClick={stopScanning}
                className="text-sm text-[#D8C5AD]/70 hover:text-[#FFFCF8] underline"
              >
                إيقاف
              </button>
            </div>
          )}

          {scanResult && (
            <div className="mt-6 p-6 rounded-[1rem] bg-[#F6F0E7] text-[#241B17] shadow-xl border border-[#B98757]">
              <div className="flex items-center gap-2 justify-center mb-3">
                <span className="material-symbols-outlined text-2xl text-[#B98757]">
                  check_circle
                </span>
                <span className="text-[18px] font-bold font-sans">
                  تم المسح بنجاح!
                </span>
              </div>
              <p className="text-sm text-[#4e4541] mb-4 font-sans">
                الرمز: <span className="font-mono text-[#B98757]">{scanResult}</span>
              </p>
              <button
                onClick={goToOrder}
                className="w-full inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#241B17] text-[#FFFCF8] font-semibold hover:bg-[#B98757] hover:text-[#241B17] transition-all duration-300 shadow-lg"
              >
                <span>انتقل إلى الطلب</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
              <button
                onClick={restartScanning}
                className="mt-3 text-sm text-[#B98757] underline hover:text-[#D4AF37] font-sans"
              >
                مسح رمز آخر
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto w-full bg-[#1A1310] text-[#D8C5AD] py-[2rem] text-center">
        <p className="text-sm font-sans">
          © 2026 SOKOON CAFÉ — جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  )
}

