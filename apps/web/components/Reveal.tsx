"use client";

import { useEffect, useRef, useState, type ElementType } from "react";

/* Scroll-triggered reveal — adds `.in` when the element enters the viewport.
   Variant maps to a starting transform; `delay` staggers grouped children. */

type Variant = "up" | "scale" | "left" | "right";

const VARIANT_CLASS: Record<Variant, string> = {
  up: "reveal",
  scale: "reveal reveal-scale",
  left: "reveal reveal-left",
  right: "reveal reveal-right",
};

export default function Reveal({
  children,
  variant = "up",
  delay = 0,
  as,
  className = "",
  style,
  once = true,
}: {
  children: React.ReactNode;
  variant?: Variant;
  delay?: number;
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  once?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  const Tag = (as ?? "div") as ElementType;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            if (once) io.disconnect();
          } else if (!once) {
            setShown(false);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <Tag
      ref={ref}
      className={`${VARIANT_CLASS[variant]} ${shown ? "in" : ""} ${className}`}
      style={{ ...style, ["--reveal-delay" as any]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
