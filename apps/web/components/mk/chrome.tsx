"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { VeyraLogo } from "./brand";
import { SIGN_UP_URL, SIGN_IN_URL, DEMO_URL, demoLinkProps } from "./links";
import { Soon } from "./soon";


const LINKS: [string, string][] = [
  ["Platform", "/platform"],
  ["Solutions", "/solutions"],
  ["Integrations", "/integrations"],
  ["Pricing", "/pricing"],
  ["Security", "/security"],
  ["Company", "/company"],
];

/** Apple's global nav: 52px of frosted glass, links centred, one action. */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > 8);
      // Is a black band under the bar right now?
      const below = document.elementFromPoint(window.innerWidth / 2, 60);
      setDark(!!below?.closest(".mk-night"));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <nav className="mk-nav" data-scrolled={scrolled || open} data-dark={dark && !open} aria-label="Main">
        <div className="mk-wrap mk-nav__row">
          <Link href="/" aria-label="Veyra home" className="shrink-0"><VeyraLogo size={24} /></Link>
          <div className="mk-nav__links">
            {LINKS.map(([label, href]) => (
              <Link key={href} href={href} className="mk-nav__link" aria-current={pathname === href ? "page" : undefined}>{label}</Link>
            ))}
          </div>
          <div className="ml-auto hidden items-center gap-5 md:flex" style={{ marginLeft: "auto" }}>
            <a href={SIGN_IN_URL} className="mk-nav__link">Sign in</a>
            <a href={DEMO_URL} {...demoLinkProps} className="mk-btn mk-btn--ghost mk-btn--sm mk-nav__demo">Request a demo</a>
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary mk-btn--sm">Get started</a>
          </div>
          <button type="button" className="ml-auto flex size-10 items-center justify-center md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="mk-nav__sheet md:hidden">
          {LINKS.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          <div className="mt-8 flex flex-col gap-3">
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary">Get started</a>
            <a href={DEMO_URL} {...demoLinkProps} className="mk-btn mk-btn--ghost">Request a demo</a>
            <a href={SIGN_IN_URL} className="mk-btn mk-btn--ghost">Sign in</a>
          </div>
        </div>
      )}
    </>
  );
}

/* footer links to parts of the product that are not live yet */
const FOOTER_SOON = new Set(["Telephony"]);

const COLUMNS: { title: string; links: [string, string][] }[] = [
  { title: "Product", links: [["Platform", "/platform"], ["Voice agents", "/platform#voice"], ["Veyra Desk", "/platform#desk"], ["Veyra Studio", "/platform#studio"], ["Pricing", "/pricing"]] },
  { title: "Solutions", links: [["Home services", "/solutions#home-services"], ["Healthcare", "/solutions#healthcare"], ["Real estate", "/solutions#real-estate"], ["Professional services", "/solutions#professional"], ["All solutions", "/solutions"]] },
  { title: "Connect", links: [["Integrations", "/integrations"], ["Telephony", "/platform#telephony"], ["Developers", "/platform#developers"], ["Security", "/security"]] },
  { title: "Company", links: [["About", "/company"], ["Contact", "/contact"], ["Request a demo", DEMO_URL], ["Privacy", "/privacy"], ["Terms", "/terms"]] },
];

/**
 * The footer ends the page with the company's name set larger than the
 * screen, sinking into the page edge behind the links.
 */
export function SiteFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-wrap">
        <div className="mk-footer__cols">
          <div>
            <VeyraLogo size={28} />
            <p className="mk-small mt-4 max-w-[30ch]">AI agents that answer, call and follow through, on every channel your customers use.</p>
            <a href={SIGN_UP_URL} className="mk-btn mk-btn--primary mk-btn--sm mt-6">Get started</a>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4>{col.title}</h4>
              <ul>{col.links.map(([label, href]) => <li key={href}>{href.startsWith("http") ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a> : <Link href={href}>{label}{FOOTER_SOON.has(label) && <Soon inline />}</Link>}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="mk-footer__legal">
          <span>Copyright © {new Date().getFullYear()} Veyra. All rights reserved.</span>
          <span className="flex gap-5"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/security">Security</Link><Link href="/contact">Contact</Link></span>
        </div>
      </div>
      <div className="mk-footer__giant" aria-hidden="true">Veyra</div>
    </footer>
  );
}
