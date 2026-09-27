import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "@/components/mk/chrome";

import "./site.css";

/* The company site. Its own palette, type and motion live in site.css under
   .mk, so the pages here share nothing visual with the old app surfaces that
   still sit in globals.css. The design rules are in DESIGN.md under
   "The company site". */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://veyra.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Veyra: AI agents that answer, call and follow through", template: "%s · Veyra" },
  description: "Veyra answers your calls, texts and email with an AI agent that books, looks things up and hands off to your team when it matters.",
};

const ORG_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Veyra",
      url: SITE_URL,
      description: "AI voice and chat agents that answer, call, and close — one grounded brain across voice, chat, phone, and SMS.",
    },
    { "@type": "WebSite", name: "Veyra", url: SITE_URL },
  ],
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_LD) }} />
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
