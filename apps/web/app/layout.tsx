import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted variable fonts (app/fonts/*.woff2) — the build never touches the
// network. Fraunces = editorial serif display; Geist = clean modern body/UI;
// JetBrains Mono = technical labels, stats, code.
const fraunces = localFont({
  src: "./fonts/fraunces.woff2",
  weight: "300 700",
  variable: "--font-serif",
  display: "swap",
});

const geist = localFont({
  src: "./fonts/geist.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
});

// Studio UI font (Plus Jakarta Sans) — applied within /studio via --font-studio
const jakarta = localFont({
  src: "./fonts/jakarta.woff2",
  weight: "200 800",
  variable: "--font-studio",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veyra — AI agents that answer, call, and close",
  description:
    "Veyra builds AI voice and chat agents that talk to your customers, run real workflows, and connect to your CRM. Sub-second, grounded, and built for the calls that break everything else.",
};

// set theme before paint: localStorage first, then OS preference
const themeScript = `(function(){try{var t=localStorage.getItem("rv-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${fraunces.variable} ${geist.variable} ${jakarta.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
