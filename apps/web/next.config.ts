import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone is for Docker only — Vercel uses its own Next.js output layout.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
};

export default nextConfig;
