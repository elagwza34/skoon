import type { NextConfig } from "next";

/**
 * Skoon — Next.js configuration.
 *
 * Kept intentionally minimal for the UI-preview phase. No production hosting,
 * image, or auth settings are assumed here yet (they belong to a later,
 * approved deployment phase).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep Prisma/bcrypt out of the client bundle and off the bundler's radar.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: {
    // Explicit tsconfig path alias (already in tsconfig, kept for clarity).
    // typedRoutes / PPR intentionally left off for the preview phase.
  },
};

export default nextConfig;
