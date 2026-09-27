"use client";

/* Scroll motion for the company site, with no animation library.

   Two mechanisms, both cheap:
   • Reveals: an IntersectionObserver flips data-in="true" once; CSS in
     site.css owns the transition. Nothing runs per frame.
   • Scenes: one passive scroll listener per scene, throttled to animation
     frames, writes a CSS variable or a transform straight onto the element.
     React never re-renders on scroll.

   Every primitive degrades under prefers-reduced-motion: reveals show
   immediately, scenes stop pinning and become ordinary layout. */

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";

/** The sticky nav's height; pinned scenes stick below it (site.css --mk-nav-h). */
const NAV_H = 52;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);
  return reduced;
}

/** True once the element has entered the viewport (never flips back). */
export function useInView<T extends Element>(options: { margin?: string; threshold?: number } = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: options.margin ?? "0px 0px -12% 0px", threshold: options.threshold ?? 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, options.margin, options.threshold]);
  return [ref, inView] as const;
}

/** Calls `onFrame(progress)` as the element crosses the viewport. */
function useScroll(ref: React.RefObject<HTMLElement | null>, onFrame: (p: number, rect: DOMRect) => void, mode: "pin" | "pass" = "pass") {
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // pin: 0 when the top reaches the nav, 1 when the bottom reaches the bottom.
      // pass: 0 when the top enters from below, 1 when the bottom leaves above.
      const p = mode === "pin" ? (NAV_H - rect.top) / Math.max(1, rect.height - (vh - NAV_H)) : (vh - rect.top) / (vh + rect.height);
      cb.current(Math.min(1, Math.max(0, p)), rect);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, mode]);
}

type Variant = "rise" | "pop" | "zoom" | "left" | "right" | "blur" | "fade";

/** One element that animates in the first time it is scrolled into view. */
export function Reveal({
  children,
  as: Tag = "div",
  variant = "rise",
  delay = 0,
  className = "",
  style,
  id,
}: {
  children: ReactNode;
  as?: ElementType;
  variant?: Variant;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref}
      id={id}
      className={`mk-reveal ${className}`}
      data-variant={variant}
      data-in={inView}
      style={{ ...style, ["--mk-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * Children pop in one after another when the group enters the viewport.
 * Each direct child gets --i; the step between them is `step` ms.
 */
export function Stagger({
  children,
  as: Tag = "div",
  step = 90,
  className = "",
  style,
}: {
  children: ReactNode;
  as?: ElementType;
  step?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  let i = 0;
  const items = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{ style?: CSSProperties }>;
    return cloneElement(el, { style: { ...el.props.style, ["--i" as string]: i++ } });
  });
  return (
    <Tag ref={ref} className={`mk-stagger ${className}`} data-in={inView} style={{ ...style, ["--mk-step" as string]: `${step}ms` }}>
      {items}
    </Tag>
  );
}

/**
 * A pinned section whose cards travel sideways as the reader scrolls down.
 * The section is exactly as tall as the horizontal distance to cover, so
 * the last card arrives just as the pin releases. Under reduced motion it
 * becomes an ordinary horizontally scrollable row.
 */
export function HorizontalScroll({
  children,
  header,
  className = "",
  trackClassName = "",
}: {
  children: ReactNode;
  header?: ReactNode;
  className?: string;
  trackClassName?: string;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [distance, setDistance] = useState(0);

  useIsoLayoutEffect(() => {
    const measure = () => {
      const t = track.current;
      if (!t) return;
      setDistance(Math.max(0, t.scrollWidth - window.innerWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  useScroll(scene, (p) => {
    if (reduced || !track.current) return;
    track.current.style.transform = `translate3d(${-p * distance}px, 0, 0)`;
    if (bar.current) bar.current.style.transform = `scaleX(${p})`;
  }, "pin");

  if (reduced) {
    return (
      <div className={className}>
        {header}
        <div className="overflow-x-auto pb-4"><div className={`mk-htrack ${trackClassName}`}>{children}</div></div>
      </div>
    );
  }

  return (
    <div ref={scene} className={`mk-scene ${className}`} style={{ height: `calc(100svh - ${NAV_H}px + ${distance}px)` }}>
      <div className="mk-scene__sticky">
        {header}
        <div ref={track} className={`mk-htrack ${trackClassName}`}>{children}</div>
        <div className="mk-wrap mt-10" aria-hidden="true">
          <div style={{ height: 3, borderRadius: 3, background: "var(--mk-line)", overflow: "hidden" }}>
            <div ref={bar} style={{ height: "100%", background: "var(--mk-ink)", transformOrigin: "left", transform: "scaleX(0)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Moves its child at a different speed from the page: 0.2 drifts up slowly, -0.2 sinks. */
export function Parallax({ children, speed = 0.15, className = "" }: { children: ReactNode; speed?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useScroll(ref, (p) => {
    if (reduced || !ref.current) return;
    ref.current.style.transform = `translate3d(0, ${(0.5 - p) * speed * 400}px, 0)`;
  });
  return <div ref={ref} className={className} style={{ willChange: "transform" }}>{children}</div>;
}

/**
 * Apple's hero move: the product starts smaller and inset, and grows to
 * full presence as the page scrolls into it.
 */
export function ZoomOnScroll({ children, from = 0.82, className = "", radius = 36 }: { children: ReactNode; from?: number; className?: string; radius?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useScroll(ref, (p) => {
    if (reduced || !inner.current) return;
    const t = Math.min(1, p / 0.55);
    const eased = 1 - Math.pow(1 - t, 3);
    inner.current.style.transform = `scale(${from + (1 - from) * eased})`;
    inner.current.style.borderRadius = `${radius * (1 - eased) + 12}px`;
  });
  return (
    <div ref={ref} className={className}>
      <div ref={inner} style={{ transformOrigin: "50% 30%", willChange: "transform", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

/** A paragraph whose words light up as it scrolls through the middle of the screen. */
export function TextReveal({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  const reduced = useReducedMotion();
  useScroll(ref, (p) => {
    const el = ref.current;
    if (!el) return;
    const lit = reduced ? words.length : Math.round(Math.min(1, Math.max(0, (p - 0.2) / 0.45)) * words.length);
    el.querySelectorAll("span").forEach((s, i) => s.setAttribute("data-on", String(i < lit)));
  });
  return (
    <p ref={ref} className={`mk-textreveal ${className}`}>
      {words.map((w, i) => <span key={i}>{w}{i < words.length - 1 ? " " : ""}</span>)}
    </p>
  );
}

/** Counts from zero to `to` once, when scrolled into view. */
export function CountUp({ to, decimals = 0, prefix = "", suffix = "", duration = 1400 }: { to: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!inView) return;
    if (reduced) { setValue(to); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(to * (1 - Math.pow(1 - t, 4)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduced]);
  return <span ref={ref} className="tabular-nums">{prefix}{value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

/** An endless rail. Children are rendered twice so the loop is seamless. */
export function Marquee({ children, reverse = false, duration = 50, gap = 28, className = "" }: { children: ReactNode; reverse?: boolean; duration?: number; gap?: number; className?: string }) {
  return (
    <div className={`mk-marquee ${className}`} data-reverse={reverse} style={{ ["--mk-marquee-dur" as string]: `${duration}s`, ["--mk-marquee-gap" as string]: `${gap}px` }}>
      <div className="mk-marquee__track">
        <div className="flex shrink-0" style={{ gap }}>{children}</div>
        <div className="flex shrink-0" style={{ gap }} aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

/**
 * A pinned stage for a sequence of beats: the progress (0..1) is handed to
 * render-prop children on every frame via a CSS variable `--p`, and the
 * active beat index via data-beat, so CSS or children can respond.
 */
export function StickyStory({ beats, height = 3, children, className = "" }: { beats: number; height?: number; children: (beat: number) => ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  const reduced = useReducedMotion();
  useScroll(ref, (p) => {
    ref.current?.style.setProperty("--p", p.toFixed(4));
    const b = Math.min(beats - 1, Math.floor(p * beats));
    setBeat((prev) => (prev === b ? prev : b));
  }, "pin");
  if (reduced) return <div className={className}>{children(beats - 1)}</div>;
  return (
    <div ref={ref} className={`mk-scene ${className}`} style={{ height: `calc(${height * 100}svh - ${NAV_H}px)` }}>
      <div className="mk-scene__sticky">{children(beat)}</div>
    </div>
  );
}
