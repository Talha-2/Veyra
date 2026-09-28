import { useEffect, useState, type ReactNode } from 'react';

import { Eyebrow } from '../ui/primitives';

export interface SectionNavItem {
    id: string;
    label: string;
    /** Quiet trailing detail, e.g. a count. */
    meta?: ReactNode;
}

/** How far below the top of the viewport a section must reach to count as "in view". */
const OFFSET = 140;

/**
 * A sticky table of contents for a long settings form. It follows the
 * scroll, so the section being read is always the highlighted one, and a
 * click glides there rather than jumping.
 */
export function SectionNav({ items, heading = 'On this page' }: { items: SectionNavItem[]; heading?: string }) {
    const [active, setActive] = useState(items[0]?.id ?? '');
    const key = items.map((i) => i.id).join('|');

    useEffect(() => {
        let frame = 0;

        const compute = (target: EventTarget | null) => {
            const els = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => el !== null);
            if (els.length === 0) return;

            let current = els[0].id;
            for (const el of els) {
                if (el.getBoundingClientRect().top <= OFFSET) current = el.id;
            }

            // At the very bottom the last section may never reach the offset
            // line; the person has clearly arrived at it, so it wins. Only the
            // container that holds the sections counts — not a textarea.
            const scroller = target instanceof HTMLElement && target.contains(els[0]) ? target : target === document ? document.scrollingElement : null;
            if (scroller && scroller.scrollHeight > scroller.clientHeight && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
                current = els[els.length - 1].id;
            }

            setActive(current);
        };

        const onScroll = (e: Event) => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => compute(e.target));
        };

        compute(null);
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('scroll', onScroll, { capture: true });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const go = (id: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(id);
        history.replaceState(null, '', `#${id}`);
    };

    return (
        <nav aria-label={heading} className="sticky top-10">
            <Eyebrow className="mb-3 block px-3">{heading}</Eyebrow>
            <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                    const on = item.id === active;
                    return (
                        <li key={item.id}>
                            <a
                                href={`#${item.id}`}
                                onClick={go(item.id)}
                                aria-current={on ? 'location' : undefined}
                                className="relative flex h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors hover:bg-surface-hover"
                                style={{ color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400, background: on ? 'var(--surface-hover)' : undefined }}
                            >
                                <span
                                    aria-hidden="true"
                                    className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full transition-opacity duration-200"
                                    style={{ background: 'var(--accent)', opacity: on ? 1 : 0 }}
                                />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {item.meta != null && <span className="text-2xs text-tertiary tabular-nums">{item.meta}</span>}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
