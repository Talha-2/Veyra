import { Link, router, useForm } from '@inertiajs/react';
import { Archive, AtSign, Bookmark, Clock, Inbox, Mail, Plus, SquarePen, Star, Trash2, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { COMING_SOON, ComingSoon } from '../ui/coming-soon';
import { Switch } from '../ui/kit';
import { Eyebrow } from '../ui/primitives';
import { channelIcon, queryInbox, type InboxState } from '../desk-inbox/helpers';
import type { SavedViewRow } from '../../types/desk';

const VIEWS: { key: string; label: string; icon: LucideIcon; emphasise?: boolean }[] = [
    { key: 'all', label: 'All', icon: Inbox },
    { key: 'mine', label: 'Assigned to me', icon: User },
    { key: 'unassigned', label: 'Unassigned', icon: Users, emphasise: true },
    { key: 'unread', label: 'Unread', icon: Mail, emphasise: true },
    { key: 'favorites', label: 'Starred', icon: Star },
    { key: 'snoozed', label: 'Snoozed', icon: Clock },
    { key: 'closed', label: 'Closed', icon: Archive },
];

/**
 * The inbox's mailbox list: built-in views with live counts, the channels
 * as folders, then saved views.
 *
 * Saved views are server-side and can be shared, so a team lead can hand the
 * team "Urdu line" or "billing complaints" as a single click.
 */
export default function ViewRail({
    current,
    counts,
    savedViews,
    currentSavedView,
    currentFilters,
    state,
    channels = [],
    onNew,
}: {
    current: string;
    counts: Record<string, number>;
    savedViews: SavedViewRow[];
    currentSavedView: string | null;
    currentFilters: Record<string, string | null>;
    state?: InboxState;
    channels?: { value: string; label: string }[];
    onNew?: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const hasFilters = Object.values(currentFilters).some((v) => v);

    return (
        <nav className="flex w-[220px] shrink-0 flex-col" style={{ background: 'var(--bg)', borderRight: '1px solid var(--border)' }} aria-label="Inbox views">
            {onNew && (
                <div className="shrink-0 px-3 pt-4 pb-2">
                    {/* Starting a thread means an SMS or email, and neither can be sent yet. */}
                    <button type="button" onClick={onNew} disabled aria-disabled="true" title={COMING_SOON} className="v-btn v-btn--quiet w-full justify-start disabled:cursor-not-allowed">
                        <SquarePen size={15} strokeWidth={1.9} />
                        <span className="min-w-0 flex-1 truncate text-left">New conversation</span>
                        <ComingSoon compact />
                    </button>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                <Group label="Views">
                    {VIEWS.map((view) => {
                        const active = current === view.key && !currentSavedView;
                        const count = counts[view.key] ?? 0;
                        return (
                            <RailLink key={view.key} href={`/desk/inbox?view=${view.key}`} icon={view.icon} active={active}
                                count={count} strong={view.emphasise && count > 0}>
                                {view.label}
                            </RailLink>
                        );
                    })}
                </Group>

                {state && channels.length > 0 && (
                    <Group label="Channels">
                        {channels.map((c) => {
                            const active = currentFilters.channel === c.value;
                            return (
                                <RailButton key={c.value} icon={channelIcon(c.value)} active={active}
                                    onClick={() => queryInbox(state, { channel: active ? undefined : c.value })}>
                                    {c.label}
                                </RailButton>
                            );
                        })}
                    </Group>
                )}

                <Group label="Saved" action={hasFilters && !saving ? (
                    <button type="button" onClick={() => setSaving(true)} title="Save the current filters as a view" aria-label="Save current filters as a view"
                        className="flex size-6 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-surface-hover hover:text-primary">
                        <Plus size={14} strokeWidth={2} />
                    </button>
                ) : undefined}>
                    {saving && <SaveViewForm filters={currentFilters} onDone={() => setSaving(false)} />}

                    {savedViews.length === 0 && !saving && (
                        <p className="px-2.5 py-1 text-xs text-tertiary">
                            {hasFilters ? 'Press + to keep these filters as a view.' : 'Filter the list by channel, tag or search, then save it here.'}
                        </p>
                    )}

                    {savedViews.map((v) => {
                        const active = String(v.id) === currentSavedView;
                        return (
                            <div key={v.id} className="group relative">
                                <RailLink href={`/desk/inbox?saved_view=${v.id}`} icon={Bookmark} active={active}
                                    trailing={v.is_shared ? <span title="Shared with the team"><AtSign size={14} strokeWidth={1.9} className="text-tertiary" /></span> : undefined}>
                                    {v.name}
                                </RailLink>
                                {v.mine && (
                                    <button type="button" title={`Delete ${v.name}`} aria-label={`Delete view ${v.name}`}
                                        onClick={() => router.delete(`/desk/inbox/views/${v.id}`, { preserveScroll: true })}
                                        className="absolute top-1/2 right-1 hidden size-6 -translate-y-1/2 items-center justify-center rounded-md text-tertiary hover:text-danger group-hover:flex"
                                        style={{ background: 'var(--surface)' }}>
                                        <Trash2 size={14} strokeWidth={1.8} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </Group>

                {state && hasFilters && !currentSavedView && (
                    <Link href={`/desk/inbox?view=${current}`} className="mt-1 block px-2.5 text-xs text-accent-text hover:underline">
                        Clear filters
                    </Link>
                )}
            </div>
        </nav>
    );
}

function Group({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
    return (
        <div className="mt-4 first:mt-2">
            <div className="mb-1 flex h-6 items-center justify-between px-2.5">
                <Eyebrow>{label}</Eyebrow>
                {action}
            </div>
            <div className="flex flex-col gap-px">{children}</div>
        </div>
    );
}

function itemStyle(active: boolean) {
    return {
        background: active ? 'var(--surface)' : undefined,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: active ? 'var(--shadow-card)' : undefined,
    };
}

function RailLink({ href, icon: Icon, active, count, strong, trailing, children }: {
    href: string; icon: LucideIcon; active: boolean; count?: number; strong?: boolean; trailing?: ReactNode; children: ReactNode;
}) {
    return (
        <Link href={href} preserveState preserveScroll aria-current={active ? 'page' : undefined}
            className="group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-surface-hover"
            style={itemStyle(active)}>
            <Icon size={16} strokeWidth={active ? 2 : 1.8} style={{ color: active ? 'var(--accent)' : undefined }} className={active ? '' : 'opacity-80'} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {trailing}
            {count != null && count > 0 && (
                <span className={`text-xs tabular-nums ${strong ? 'font-semibold text-primary' : 'text-tertiary'}`}>{count}</span>
            )}
        </Link>
    );
}

function RailButton({ icon: Icon, active, onClick, children }: { icon: LucideIcon; active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={active}
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-hover"
            style={itemStyle(active)}>
            <Icon size={16} strokeWidth={active ? 2 : 1.8} style={{ color: active ? 'var(--accent)' : undefined }} className={active ? '' : 'opacity-80'} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{children}</span>
        </button>
    );
}

function SaveViewForm({ filters, onDone }: { filters: Record<string, string | null>; onDone: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ surface: 'inbox', name: '', filters, is_shared: false });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/inbox/views', { preserveScroll: true, onSuccess: onDone }); };

    return (
        <form onSubmit={submit} className="v-panel mb-1.5 animate-pop p-2.5" onKeyDown={(e) => e.key === 'Escape' && onDone()}>
            <input className="v-field h-8 text-sm" placeholder="Name this view" aria-label="View name" value={data.name} onChange={(e) => setData('name', e.target.value)} autoFocus />
            {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-secondary">Share with team</span>
                <Switch size="sm" checked={data.is_shared} onChange={(v) => setData('is_shared', v)} label="Share with team" />
            </div>
            <div className="mt-2.5 flex justify-end gap-1.5">
                <button type="button" onClick={onDone} className="v-btn v-btn--ghost v-btn--sm">Cancel</button>
                <button type="submit" className="v-btn v-btn--quiet v-btn--sm" disabled={processing || !data.name.trim()}>Save view</button>
            </div>
        </form>
    );
}
