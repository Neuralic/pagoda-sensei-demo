import type { NextConfig } from "next";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
let supabaseHostname: string | undefined
try {
  if (SUPABASE_URL) supabaseHostname = new URL(SUPABASE_URL).hostname
} catch {
  supabaseHostname = undefined
}

const nextConfig: NextConfig = {
  // Allow dev server access via LAN IP (not only localhost). Without this, Next.js 16
  // blocks /_next/* from other origins and client JS (login forms, etc.) may not run.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["23.131.24.121"],
  images: {
    domains: [
      "xwgbsjsdbxpsksosxhkt.supabase.co",
      "localhost",
      "pagoda-travel.vercel.app",
    ],
    remotePatterns: [
      
      {
        protocol: "https",
        hostname: "*.pagoda-travel.vercel.app",
      },
      {
        protocol: "https",
        hostname: "*.vercel.app",
      },
      {
        protocol: "https",
        hostname: supabaseHostname || "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: supabaseHostname || "*.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
      {
        protocol: "http",
        hostname: "23.131.24.121",
        port: "3001",
        pathname: "/**",
      },
    ],
    unoptimized: false,
    // Next only serves WebP by default, so an AVIF source was still being re-encoded to WebP
    // on the way out. AVIF first, WebP for browsers that cannot take it — the browser's
    // Accept header decides, and Next caches each variant.
    formats: ["image/avif", "image/webp"],
  },
  productionBrowserSourceMaps: false,
  // Cross-platform compatibility
  reactStrictMode: true,
  // Vercel deployment optimization
  output: 'standalone',
  // Note: Turbopack is disabled via environment variable in build script
  // This is necessary because Tailwind CSS v4's lightningcss native module
  // doesn't work with Turbopack on Vercel's Linux environment
  // eslint: {
  //   ignoreDuringBuilds: true,
  // },
};

export default nextConfig;
