/**
 * Builds a Pexels CDN URL for a photo id. The host `images.pexels.com` must be
 * allow-listed under `images.remotePatterns` in next.config.ts, otherwise
 * next/image refuses to optimise it and renders a broken image. `w=` caps the
 * source width so Next only optimises what it needs.
 */
export const pexels = (id: string, w = 600) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

/** A coffee/latte shot wide enough to cover a full desktop viewport. */
export const BACKGROUND_ID = '302899'