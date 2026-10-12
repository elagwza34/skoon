import Image from 'next/image'
import { pexels, BACKGROUND_ID } from '@/lib/pexels'

/**
 * Full-viewport brand backdrop shared by the public (customer-facing) pages —
 * the landing page and the order flow. Renders a coffee photo `fixed` across
 * the whole screen with an orange + dark overlay so centred content stays
 * readable. `aria-hidden` because it is purely decorative.
 */
export function PublicBackdrop() {
  return (
    <div className="fixed inset-0 z-0 bg-purple-950" aria-hidden="true">
      <Image
        src={pexels(BACKGROUND_ID, 1920)}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-orange-500/60 mix-blend-multiply" />
      <div className="absolute inset-0 bg-black/90" />
    </div>
  )
}