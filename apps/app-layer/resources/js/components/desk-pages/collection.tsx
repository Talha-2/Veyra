import { Link } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Columns3, List as ListIcon, SlidersHorizontal, Table2, Users, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { PeoplePicker } from '../desk-inbox/controls';
import Popover from '../ui/popover';
import { toneColor, type Tone } from '../ui/primitives';

/**
 * The pieces a staged collection (tickets, leads) is browsed with: the
 * Board / List / Table switch, filter pills, a status pill that edits in
 * place, collapsible group headers, sortable column heads and the floating
 * bar that acts on a selection.
 */

export type ViewMode = 'board' | 'list' | 'table';

const MODES: { key: ViewMode; label: string; icon: ReactNode }[] = [
    { key: 'board', label: 'Board', icon: <Columns3 size={15} strokeWidth={1.9} /> },
    { key: 'list', label: 'List', icon: <ListIcon size={15} strokeWidth={1.9} /> },
    { key: 'table', label: 'Table', icon: <Table2 size={15} strokeWidth={1.9} /> },
];

/** Link-driven, so the view lives in the URL and survives filters and pages. */
export function ViewModeSwitch({ current, hrefFor }: { current: ViewMode; hrefFor: (mode: ViewMode) => string }) {
    return (
        <nav aria-label="View" className="inline-flex shrink-0 items-center gap-0.5 rounded-[10px] p-[3px]" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            {MODES.map((m) => {
                const active = m.key === current;
                return (
                    <Link key={m.key} href={hrefFor(m.key)} preserveState preserveScroll aria-current={active ? 'page' : undefined}
                        className="flex h-7 items-center gap-1.5 rounded-[8px] px-3 text-sm font-medium transition-all"
                        style={{ background: active ? 'var(--surface-raised)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: active ? 'var(--shadow-card)' : 'none' }}>
                        {m.icon}{m.label}
                    </Link>
                );
            })}
        </nav>
    );
}

/** A select dressed as a pill, tinted when it narrows the list. */
export function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <span className="relative inline-flex shrink-0">
            <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
                className="h-9 cursor-pointer appearance-none rounded-full pr-9 pl-4 text-sm font-medium transition-colors hover:bg-surface-hover"
                style={{ background: value ? 'var(--accent-subtle)' : 'var(--surface)', color: value ? 'var(--accent-text)' : 'var(--text-primary)', border: `1px solid ${value ? 'transparent' : 'var(--border-strong)'}`, boxShadow: 'var(--shadow-xs)' }}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2" style={{ color: value ? 'var(--accent-text)' : 'var(--text-tertiary)' }} />
        </span>
    );
}

/** The less-used filters behind one pill, with a count of how many are set. */
export function FiltersPopover({ active, onClear, children }: { active: number; onClear: () => void; children: ReactNode }) {
    return (
        <Popover align="end" width={320} trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
                style={{ background: active ? 'var(--accent-subtle)' : 'var(--surface)', color: active ? 'var(--accent-text)' : 'var(--text-primary)', border: `1px solid ${active ? 'transparent' : 'var(--border-strong)'}`, boxShadow: 'var(--shadow-xs)' }}>
                <SlidersHorizontal size={14} strokeWidth={1.9} />
                Filters
                {active > 0 && <span className="flex size-5 items-center justify-center rounded-full text-2xs font-semibold tabular-nums" style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>{active}</span>}
            </button>
        )}>
            {(close) => (
                <div className="flex flex-col gap-5 p-5">
                    {children}
                    <div className="flex justify-between gap-2 pt-1">
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm" disabled={!active} onClick={() => { onClear(); close(); }}>Clear all</button>
                        <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={close}>Done</button>
                    </div>
                </div>
            )}
        </Popover>
    );
}

const TONE_BG: Record<Tone, string> = {
    accent: 'var(--accent-subtle)', success: 'var(--success-subtle)', warning: 'var(--warning-subtle)',
    danger: 'var(--danger-subtle)', info: 'var(--info-subtle)', muted: 'var(--surface-sunken)',
};
const TONE_FG: Record<Tone, string> = {
    accent: 'var(--accent-text)', success: 'var(--success)', warning: 'var(--warning)',
    danger: 'var(--danger)', info: 'var(--info)', muted: 'var(--text-secondary)',
};

/** Status as a tinted pill that is also a select, so a row moves on in place. `color` overrides the tone's dot (pipeline stages). */
export function StatusPill({ value, label, options, onChange, tone = 'muted', color }: {
    value: string; label: string; options: { value: string; label: string }[]; onChange: (v: string) => void; tone?: Tone; color?: string;
}) {
    const bg = color ? `color-mix(in srgb, ${color} 14%, transparent)` : TONE_BG[tone];
    const fg = color ? 'var(--text-primary)' : TONE_FG[tone];

    return (
        <span className="relative inline-flex shrink-0" onClick={(e) => e.stopPropagation()}>
            <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
                className="h-7.5 max-w-[180px] cursor-pointer appearance-none truncate rounded-full pr-7.5 pl-6.5 text-xs font-medium transition-[filter] hover:brightness-95"
                style={{ background: bg, color: fg, border: 'none' }}>
                {options.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="pointer-events-none absolute top-1/2 left-2.5 size-2 -translate-y-1/2 rounded-full" style={{ background: color ?? toneColor(tone) }} aria-hidden="true" />
            <ChevronDown size={12} strokeWidth={2.2} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2" style={{ color: fg }} />
        </span>
    );
}

/** A group's title row in the list view: click to fold it away. */
export function GroupHeader({ open, onToggle, color, title, count, meta, action }: {
    open: boolean; onToggle: () => void; color?: string; title: string; count: number; meta?: ReactNode; action?: ReactNode;
}) {
    return (
        <div className="flex h-14 items-center gap-3 pr-4 pl-3" style={open ? { borderBottom: '1px solid var(--separator)' } : undefined}>
            <button type="button" onClick={onToggle} aria-expanded={open}
                className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] px-3 text-left transition-colors hover:bg-surface-hover">
                <ChevronDown size={16} strokeWidth={2} className="shrink-0 text-tertiary transition-transform duration-200" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
                {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />}
                <span className="truncate text-md font-semibold text-primary">{title}</span>
                <span className="inline-flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-secondary tabular-nums" style={{ background: 'var(--surface-sunken)' }}>{count}</span>
                {meta && <span className="ml-auto pl-3 text-sm font-medium text-secondary tabular-nums">{meta}</span>}
            </button>
            {action}
        </div>
    );
}

/** Remembers which groups are folded, per page, for this browser. */
export function useFolded(key: string): [Set<string>, (id: string) => void] {
    const [folded, setFolded] = useState<Set<string>>(new Set());
    useEffect(() => {
        try { setFolded(new Set(JSON.parse(localStorage.getItem(key) ?? '[]'))); } catch { /* private mode */ }
    }, [key]);
    const toggle = (id: string) => setFolded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
    });
    return [folded, toggle];
}

// ── table ────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

/**
 * A card that holds a table whose header row sticks to the top of the window
 * as the page scrolls. On wide screens `overflow-x: clip` (not auto) keeps the
 * rounded corners without creating a scroll container, which would stop the
 * header sticking; on narrow ones the table scrolls sideways instead.
 */
export function DataTable({ head, children, minWidth = 960 }: { head: ReactNode; children: ReactNode; minWidth?: number }) {
    return (
        <div className="v-panel overflow-x-auto xl:overflow-x-clip">
            <table className="w-full border-separate border-spacing-0 text-left" style={{ minWidth }}>
                <thead>
                    <tr>{head}</tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

const TH = 'sticky top-0 z-10 h-12 px-4 text-xs font-medium whitespace-nowrap text-tertiary first:rounded-tl-[var(--radius-lg)] first:pl-6 last:rounded-tr-[var(--radius-lg)] last:pr-6';
const TH_STYLE = { background: 'color-mix(in srgb, var(--surface) 92%, transparent)', backdropFilter: 'saturate(180%) blur(12px)', WebkitBackdropFilter: 'saturate(180%) blur(12px)', boxShadow: 'inset 0 -1px 0 var(--separator)' };

export function HeadCell({ children, align = 'left', width, className = '' }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; width?: number; className?: string }) {
    return <th scope="col" className={`${TH} ${className}`} style={{ ...TH_STYLE, textAlign: align, width }}>{children}</th>;
}

/** A column head that sorts. Click once for ascending, again for descending. */
export function SortHead({ label, sortKey, current, dir, onSort, align = 'left', width, className = '' }: {
    label: string; sortKey: string; current: string | null; dir: SortDir; onSort: (key: string, dir: SortDir) => void; align?: 'left' | 'right'; width?: number; className?: string;
}) {
    const active = current === sortKey;
    const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;

    return (
        <th scope="col" className={`${TH} ${className}`} style={{ ...TH_STYLE, textAlign: align, width }} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" onClick={() => onSort(sortKey, active && dir === 'asc' ? 'desc' : 'asc')}
                className={`-mx-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-surface-hover hover:text-primary ${align === 'right' ? 'flex-row-reverse' : ''}`}
                style={{ color: active ? 'var(--text-primary)' : undefined }}>
                {label}
                <Icon size={13} strokeWidth={2} style={{ opacity: active ? 1 : 0.5 }} />
            </button>
        </th>
    );
}

export function Cell({ children, align = 'left', className = '' }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
    return (
        <td className={`h-13 px-4 text-sm text-primary first:pl-6 last:pr-6 ${className}`} style={{ textAlign: align, borderTop: '1px solid var(--separator)' }}>
            {children}
        </td>
    );
}

/** A table row that opens its record when clicked anywhere but a control. */
export function TableRow({ children, onOpen, selected = false }: { children: ReactNode; onOpen?: () => void; selected?: boolean }) {
    return (
        <tr className={`transition-colors ${onOpen ? 'cursor-pointer' : ''} ${selected ? '' : 'hover:bg-surface-hover'} [&:first-child>td]:border-t-0`}
            style={selected ? { background: 'var(--accent-subtle)' } : undefined}
            onClick={(e) => {
                if (!onOpen || (e.target as HTMLElement).closest('a,button,input,select,label')) return;
                onOpen();
            }}>
            {children}
        </tr>
    );
}

export function Checkbox({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="-m-2 inline-flex cursor-pointer items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)}
                ref={(el) => { if (el) el.indeterminate = indeterminate; }} className="cursor-pointer" style={{ width: 16, height: 16 }} />
        </label>
    );
}

/** A selection held across a page: ids, and helpers to toggle one or all. */
export function useSelection(ids: number[]) {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const key = ids.join(',');
    // Drop selections that are no longer on screen (a filter or page changed).
    useEffect(() => { setSelected((prev) => new Set([...prev].filter((id) => ids.includes(id)))); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    const all = ids.length > 0 && ids.every((id) => selected.has(id));
    const some = !all && ids.some((id) => selected.has(id));

    return {
        selected,
        count: selected.size,
        has: (id: number) => selected.has(id),
        toggle: (id: number, on: boolean) => setSelected((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; }),
        all, some,
        toggleAll: (on: boolean) => setSelected(on ? new Set(ids) : new Set()),
        clear: () => setSelected(new Set()),
    };
}

/** Floats in at the bottom of the window while rows are selected. */
export function BulkBar({ count, noun, onClear, children }: { count: number; noun: [string, string]; onClear: () => void; children: ReactNode }) {
    if (count === 0) return null;

    return createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[80] flex justify-center px-4">
            <div role="toolbar" aria-label="Bulk actions"
                className="v-glass pointer-events-auto flex animate-pop flex-wrap items-center gap-2 rounded-full py-2 pr-2 pl-5"
                style={{ boxShadow: 'var(--shadow-overlay)' }}>
                <span className="mr-2 text-sm font-semibold whitespace-nowrap text-primary tabular-nums">{count} {count === 1 ? noun[0] : noun[1]} selected</span>
                {children}
                <span className="mx-1 h-6 w-px" style={{ background: 'var(--border-strong)' }} aria-hidden="true" />
                <button type="button" onClick={onClear} aria-label="Clear selection" title="Clear selection"
                    className="flex size-9 items-center justify-center rounded-full text-secondary transition-colors hover:bg-surface-hover hover:text-primary">
                    <X size={16} strokeWidth={2} />
                </button>
            </div>
        </div>,
        document.body,
    );
}

/**
 * A menu that opens above its trigger: the bulk bar sits at the bottom of the
 * window, where a menu opening downward would fall off the screen.
 */
function UpMenu({ trigger, width, children }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; width: number; children: (close: () => void) => ReactNode }) {
    const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);
    const anchor = useRef<HTMLSpanElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const close = () => setPos(null);
    const toggle = () => {
        if (pos) return close();
        const r = anchor.current?.getBoundingClientRect();
        if (r) setPos({ bottom: window.innerHeight - r.top + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    };

    useEffect(() => {
        if (!pos) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!anchor.current?.contains(t) && !panel.current?.contains(t)) close();
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [pos]);

    return (
        <>
            <span ref={anchor} className="inline-flex">{trigger({ open: !!pos, toggle })}</span>
            {pos && createPortal(
                <div ref={panel} role="menu" className="v-panel fixed z-[90] animate-pop overflow-hidden"
                    style={{ bottom: pos.bottom, left: pos.left, width, background: 'var(--surface-raised)', boxShadow: 'var(--shadow-overlay)' }}>
                    {children(close)}
                </div>,
                document.body,
            )}
        </>
    );
}

/** A bulk action that picks a value from a short list. */
export function BulkPick({ label, icon, options, onPick }: { label: string; icon?: ReactNode; options: { value: string; label: string; color?: string }[]; onPick: (value: string) => void }) {
    return (
        <UpMenu width={240} trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className="v-btn v-btn--quiet">
                {icon}{label}<ChevronDown size={13} strokeWidth={2} className="text-tertiary" />
            </button>
        )}>
            {(close) => (
                <div className="max-h-[320px] overflow-y-auto p-1.5">
                    {options.map((o) => (
                        <button key={o.value} type="button" role="menuitem" onClick={() => { close(); onPick(o.value); }}
                            className="flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-left text-sm text-primary transition-colors hover:bg-surface-hover">
                            {o.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden="true" />}
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </UpMenu>
    );
}

/** Pick people, then apply: the selection's assignees are replaced with these. */
export function BulkAssign({ team, onApply }: { team: { id: number; name: string }[]; onApply: (ids: number[]) => void }) {
    const [ids, setIds] = useState<number[]>([]);

    return (
        <UpMenu width={300} trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className="v-btn v-btn--quiet"><Users size={14} strokeWidth={1.9} />Assign</button>
        )}>
            {(close) => (
                <div className="flex flex-col gap-3 p-3">
                    <p className="px-1 text-xs text-tertiary">Replaces who is assigned on every selected row.</p>
                    <PeoplePicker team={team} value={ids} onChange={setIds} maxHeight={240} />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={close}>Cancel</button>
                        <button type="button" className="v-btn v-btn--primary v-btn--sm" onClick={() => { close(); onApply(ids); setIds([]); }}>
                            {ids.length === 0 ? 'Unassign' : `Assign ${ids.length}`}
                        </button>
                    </div>
                </div>
            )}
        </UpMenu>
    );
}

/** Previous / next for a paginated table. */
export function Pager({ from, to, total, prev, next, current, last }: { from?: number | null; to?: number | null; total?: number; prev?: string | null; next?: string | null; current?: number; last?: number }) {
    if (!last || last <= 1) {
        return total != null ? <p className="px-1 text-sm text-tertiary tabular-nums">{total.toLocaleString()} in all</p> : null;
    }

    return (
        <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-sm text-tertiary tabular-nums">{from}–{to} of {total?.toLocaleString()}</span>
            <div className="flex items-center gap-2">
                <PageLink href={prev} label="Previous" />
                <span className="px-2 text-sm text-secondary tabular-nums">Page {current} of {last}</span>
                <PageLink href={next} label="Next" />
            </div>
        </div>
    );
}

function PageLink({ href, label }: { href?: string | null; label: string }) {
    if (!href) return <span className="v-btn v-btn--quiet v-btn--sm opacity-40" aria-disabled="true">{label}</span>;
    return <Link href={href} preserveScroll className="v-btn v-btn--quiet v-btn--sm">{label}</Link>;
}
