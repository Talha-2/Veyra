import localFont from "next/font/local";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/site/SiteFooter";

/* Marketing-site chrome. The site subtree reads in Inter (the seasonSans
   stand-in) and Geist Mono; both are registered here so app surfaces keep
   their own faces and pay nothing for these. */
const inter = localFont({
  src: "../fonts/inter.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

const geistMono = localFont({
  src: "../fonts/geist-mono.woff2",
  weight: "100 900",
  variable: "--font-gm",
  display: "swap",
});

/* Direction contract — audited at finish; must survive the production build. */
const CONTRACT = `<!--
THESIS: A voice-AI platform rendered as the console it is — midnight canvas, hairline structure,
whispered weight-300 headlines — refusing the aurora/glass/gradient SaaS hero.
OWN-WORLD: Void #0e0e13 / Carbon #09090b surfaces, Iron #27272a hairlines, Cream #fffaea ink,
Ember #e96b34 + Mint #62f6b5 pill pair, six-color spectrogram quarantined to the hero waveform,
5.6px containers, wide-tracked Geist Mono labels, Inter at 300-650. Flat, shadowless.
STORY: A business owner sees their calls answered by serious infrastructure they can run without
engineers — and either requests a demo (Ember) or starts free (Mint).
FIRST VIEWPORT: Centered two-line light headline, one-sentence sub, the binary pill pair, the
inverted cream TALK TO VERA console, and the full-bleed spectrogram closing the fold.
FORM: brief-pinned (user-supplied Vapi reference beats the roll); seed: vapi-console/pinned.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, and DESIGN.md
-->`;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site-shell ${inter.variable} ${geistMono.variable}`}>
      <div hidden aria-hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
