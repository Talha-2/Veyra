/* The single continuous background for the whole marketing site.
   It is fixed to the viewport, so as you scroll every page shares one moving
   field of colour — the site reads as one surface, never a stack of bordered
   sections. Purely decorative and theme-aware (colours come from tokens). */

export default function AuroraField() {
  return (
    <div className="aurora" aria-hidden>
      <span className="aurora__blob b1" />
      <span className="aurora__blob b2" />
      <span className="aurora__blob b3" />
      <span className="aurora__blob b4" />
      <span className="aurora__blob b5" />
      <div className="aurora__grid" />
      <div className="aurora__veil" />
    </div>
  );
}
