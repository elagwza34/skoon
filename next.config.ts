import type { NextConfig } from "next";

/**
 * Skoon — Next.js configuration.
 *
 * Kept intentionally minimal for the UI-preview phase. No production hosting
 * or auth settings are assumed here yet (they belong to a later, approved
 * deployment phase). The only exception is `images.remotePatterns`, which is
 * required for any external <Image> to render at all — see the note there.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep Prisma/bcrypt out of the client bundle and off the bundler's radar.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    // next/image refuses to optimise any host that is not allow-listed here,
    // which renders every external <Image> broken at runtime. Allow-list the
    // hosts the landing page actually pulls from.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
        pathname: "/photos/**",
      },
      {
        protocol: "https",
        hostname: "skooncafe.com",
        pathname: "/images/**",
      },
    ],
  },
  experimental: {
    // Explicit tsconfig path alias (already in tsconfig, kept for clarity).
    // typedRoutes / PPR intentionally left off for the preview phase.
  },
};

export default nextConfig;
