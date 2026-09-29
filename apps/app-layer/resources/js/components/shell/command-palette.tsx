import { router, usePage } from '@inertiajs/react';
import { CornerDownLeft, Moon, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { SharedProps } from '../../types';
import { ComingSoon } from '../ui/coming-soon';
import { Kbd } from '../ui/primitives';
import { NAV } from './nav';

interface Command { id: string; group: string; label: string; hint?: string; icon: ReactNode; keywords?: string; soon?: boolean; run: () => void }

/**
 * ⌘K. Every page you can open, a few actions, and — when nothing matches —
 * "Ask the agent", which carries what you typed into Ask.
 */
export default function CommandPalette() {
    const { surfaces } = usePage<SharedProps>().props;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
        };
        const onOpen = () => setOpen(true);
        window.addEventListener('keydown', onKey);
        window.addEventListener('veyra:palette', onOpen);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('veyra:palette', onOpen); };
    }, []);

    useEffect(() => { if (open) { setQuery(''); setIndex(0); } }, [open]);

    const commands = useMemo<Command[]>(() => {
        const out: Command[] = [];
        for (const s of surfaces) {
            for (const group of NAV[s.key]) {
                for (const item of group.items) {
                    const Icon = item.icon;
                    out.push({ id: `${s.key}:${item.href}`, group: s.label, label: item.label, hint: item.href, icon: <Icon size={15} strokeWidth={1.8} />, keywords: item.keywords, soon: item.soon, run: () => router.visit(item.href) });
                }
            }
        }
        const hasStudio = surfaces.some((s) => s.key === 'studio');
        if (hasStudio) {
            out.push({ id: 'new-skill', group: 'Actions', label: 'New skill', icon: <Sparkles size={15} />, keywords: 'create write playbook', run: () => router.visit('/studio/skills?new=1') });
            out.push({ id: 'new-automation', group: 'Actions', label: 'New automation', icon: <Sparkles size={15} />, keywords: 'create schedule', run: () => router.visit('/studio/automations?new=1') });
            out.push({ id: 'connect-app', group: 'Actions', label: 'Connect an app', icon: <Sparkles size={15} />, keywords: 'integration composio', run: () => router.visit('/studio/integrations/catalog') });
        }
        out.push({ id: 'theme', group: 'Actions', label: 'Toggle dark mode', icon: <Moon size={15} />, keywords: 'theme light appearance', run: () => {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('veyra-theme', next); } catch { /* not remembered */ }
        } });
        return out;
    }, [surfaces]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matches = q ? commands.filter((c) => `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase().includes(q)) : commands;
        const hasStudio = surfaces.some((s) => s.key === 'studio');
        if (q && hasStudio) {
            matches.push({ id: 'ask', group: 'Ask', label: `Ask the agent: “${query.trim()}”`, icon: <Sparkles size={15} />, run: () => router.visit(`/studio/ask?q=${encodeURIComponent(query.trim())}`) });
        }
        return matches;
    }, [commands, query, surfaces]);

    useEffect(() => { setIndex(0); }, [query]);
    useEffect(() => { listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' }); }, [index]);

    if (!open) return null;

    const run = (c: Command | undefined) => { if (!c) return; setOpen(false); c.run(); };
    let lastGroup = '';

    return createPortal(
        <div className="fixed inset-0 z-[150] flex animate-fade-in items-start justify-center px-4 pt-[14vh]" style={{ background: 'rgba(0,0,0,0.22)' }} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="v-glass w-full max-w-[600px] animate-pop overflow-hidden rounded-2xl" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-overlay)' }} role="dialog" aria-label="Command palette">
                <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid var(--separator)' }}>
                    <Search size={17} className="shrink-0 text-tertiary" />
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages and actions, or ask the agent…"
                        className="h-14 min-w-0 flex-1 bg-transparent text-md text-primary outline-none placeholder:text-tertiary"
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(filtered.length - 1, i + 1)); }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
                            if (e.key === 'Enter') { e.preventDefault(); run(filtered[index]); }
                            if (e.key === 'Escape') setOpen(false);
                        }} />
                    <Kbd>esc</Kbd>
                </div>
                <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
                    {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-tertiary">Nothing matches.</p>}
                    {filtered.map((c, i) => {
                        const heading = c.group !== lastGroup ? c.group : null;
                        lastGroup = c.group;
                        return (
                            <div key={c.id}>
                                {heading && <div className="v-eyebrow px-3 pt-3 pb-1.5 first:pt-1">{heading}</div>}
                                <button type="button" data-index={i} onMouseMove={() => setIndex(i)} onClick={() => run(c)}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base transition-colors"
                                    style={{ background: i === index ? 'var(--surface-active)' : 'transparent', color: 'var(--text-primary)' }}>
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-secondary" style={{ background: 'var(--surface-sunken)' }}>{c.icon}</span>
                                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                                    {c.soon && <ComingSoon compact />}
                                    {i === index && <CornerDownLeft size={14} className="text-tertiary" />}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    );
}
