import Link from "next/link";

/* Themed 404 — a bad URL lands on the console, not a raw browser page.
   Lives at the app root so it catches every unmatched route (site, studio,
   desk). Kept dependency-free: tokens only, no site chrome. */

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: "var(--bg)" }}
    >
      <p
        className="mono text-[12px] font-medium uppercase"
        style={{ letterSpacing: "0.08em", color: "var(--text-secondary)" }}
      >
        404 — this page does not exist
      </p>
      <h1
        style={{
          fontWeight: 300,
          fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: "var(--text-primary)",
          maxWidth: "18ch",
          textWrap: "balance",
        }}
      >
        The line you dialed isn&rsquo;t connected.
      </h1>
      <p className="text-[15px]" style={{ color: "var(--text-secondary)", maxWidth: "42ch" }}>
        Check the address, or head back to somewhere that picks up.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="btn-ember">
          Back to the site
        </Link>
        <Link href="/desk/inbox" className="btn-mint">
          Open the desk
        </Link>
      </div>
    </div>
  );
}
