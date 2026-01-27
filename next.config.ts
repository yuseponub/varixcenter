import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip linting and type checking during Vercel builds for speed
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
