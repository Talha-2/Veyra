import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://veyra.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/studio", "/desk", "/login", "/signup", "/forgot", "/auth"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
