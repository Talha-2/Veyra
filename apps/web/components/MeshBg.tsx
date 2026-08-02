/* Per-section animated mesh background. Each variant lays out blurred,
   continuously-drifting color blobs (and optional grid/beam layers) in a
   distinct arrangement, so every section of the page moves differently.
   Purely decorative + theme-aware (colors come from tokens). */

type Variant = "hero" | "platform" | "stats" | "reliability" | "cta" | "auth";

function Blob({
  color,
  drift,
  size,
  top,
  left,
  right,
  bottom,
}: {
  color: string;
  drift: string;
  size: number;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
}) {
  return (
    <span
      className={`blob ${color} ${drift}`}
      style={{ width: size, height: size, top, left, right, bottom }}
    />
  );
}

export default function MeshBg({ variant, className = "" }: { variant: Variant; className?: string }) {
  if (variant === "hero")
    return (
      <div className={`mesh mesh-grid ${className}`} aria-hidden>
        <Blob color="blob-blue" drift="drift-a" size={620} top="-16%" left="4%" />
        <Blob color="blob-cyan" drift="drift-b" size={520} top="-10%" right="2%" />
        <Blob color="blob-violet" drift="drift-c" size={460} top="24%" left="34%" />
      </div>
    );
  if (variant === "platform")
    return (
      <div className={`mesh ${className}`} aria-hidden>
        <Blob color="blob-cyan" drift="drift-b" size={520} top="8%" right="-8%" />
        <Blob color="blob-blue" drift="drift-c" size={440} bottom="-14%" left="-6%" />
      </div>
    );
  if (variant === "stats")
    return (
      <div className={`mesh mesh-beams ${className}`} aria-hidden>
        <Blob color="blob-blue" drift="drift-a" size={560} top="-30%" left="30%" />
      </div>
    );
  if (variant === "reliability")
    return (
      <div className={`mesh ${className}`} aria-hidden>
        <Blob color="blob-violet" drift="drift-a" size={480} top="-10%" left="-8%" />
        <Blob color="blob-cyan" drift="drift-c" size={420} bottom="-16%" right="-4%" />
      </div>
    );
  if (variant === "auth")
    return (
      <div className={`mesh mesh-grid ${className}`} aria-hidden>
        <Blob color="blob-blue" drift="drift-a" size={540} top="-20%" left="-10%" />
        <Blob color="blob-cyan" drift="drift-b" size={480} bottom="-18%" right="-12%" />
        <Blob color="blob-violet" drift="drift-c" size={360} top="30%" right="20%" />
      </div>
    );
  // cta
  return (
    <div className={`mesh mesh-beams ${className}`} aria-hidden>
      <Blob color="blob-blue" drift="drift-b" size={520} top="-24%" left="18%" />
      <Blob color="blob-cyan" drift="drift-a" size={420} bottom="-20%" right="14%" />
    </div>
  );
}
