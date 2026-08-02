import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/site/SiteFooter";
import AuroraField from "@/components/site/AuroraField";

/* Shared chrome for the whole marketing site. One aurora sits behind every
   page (fixed to the viewport), so the site reads as a single continuous
   surface rather than a stack of bordered sections. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <AuroraField />
      <div className="site-main">
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
