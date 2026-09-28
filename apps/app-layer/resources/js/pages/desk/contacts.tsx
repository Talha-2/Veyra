import { Head, Link, router } from '@inertiajs/react';
import { Download, LayoutGrid, List as ListIcon, Star, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ChannelMarks, PageLinks, ViewSwitch } from '../../components/desk-pages/bits';
import { Cell, DataTable, HeadCell, TableRow } from '../../components/desk-pages/collection';
import { initialsOf } from '../../components/desk-pages/format';
import { DeskPage, Panel } from '../../components/desk-pages/layout';
import { SearchField } from '../../components/ui/kit';
import { PageHeader, Segmented } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, RelativeTime, UserText, type Tone } from '../../components/ui/primitives';

interface ContactRow {
    id: number; name: string; initials: string; is_favorite: boolean; phone: string | null; email: string | null; company: string | null;
    stage: string; stage_label: string; stage_tone: Tone; owner: string | null; conversations_count: number; last_contact_at: string | null;
    channels?: string[];
}
interface Props {
    contacts: { data: ContactRow[]; links: { url: string | null; label: string; active: boolean }[]; total: number; from?: number | null; to?: number | null };
    layout: 'table' | 'cards';
    filters: { search: string | null; stage: string | null; favorites: boolean };
    stages: { value: string; label: string; tone: Tone }[];
}

/**
 * Everyone the business has spoken to, most recently spoken to first. The
 * search, the stage filter and the layout all live in the URL, so a filtered
 * list is a link someone can share.
 */
export default function Contacts({ contacts, layout, filters, stages }: Props) {
    const [term, setTerm] = useState(filters.search ?? '');
    const params = (patch: Record<string, string | undefined>) => new URLSearchParams(Object.entries({ layout, search: term || undefined, stage: filters.stage ?? undefined, favorites: filters.favorites ? '1' : undefined, ...patch }).filter(([, v]) => v) as [string, string][]).toString();

    useEffect(() => {
        if ((filters.search ?? '') === term) return;
        const t = setTimeout(() => router.get(`/desk/contacts?${params({})}`, {}, { preserveState: true, preserveScroll: true, replace: true }), 250);
        return () => clearTimeout(t);
    }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleFavorite = (id: number) => router.post(`/desk/contacts/${id}/favorite`, {}, { preserveScroll: true, preserveState: true });
    const filtered = !!(filters.search || filters.stage || filters.favorites);

    return (
        <>
            <Head title="Contacts" />
            <DeskPage width="wide" header={
                <PageHeader
                    title="Contacts"
                    description="Everyone who has called, texted or emailed, most recent first."
                    meta={<Badge tone="muted">{contacts.total.toLocaleString()} {filtered ? 'matching' : 'people'}</Badge>}
                    actions={
                        <a href={`/desk/contacts/export?${params({ layout: undefined })}`} className="v-btn v-btn--quiet">
                            <Download size={14} strokeWidth={1.8} />Export CSV
                        </a>
                    }
                />
            }>
                <section className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <Segmented className="" current={filters.favorites ? 'favorites' : (filters.stage ?? 'all')}
                            options={[{ key: 'all', label: 'All' }, { key: 'favorites', label: 'Starred' }, ...stages.map((s) => ({ key: s.value, label: s.label }))]}
                            hrefFor={(key) => `/desk/contacts?${params({ stage: key === 'all' || key === 'favorites' ? undefined : key, favorites: key === 'favorites' ? '1' : undefined })}`} />
                        <div className="flex-1" />
                        <SearchField value={term} onChange={setTerm} placeholder="Search contacts" className="w-full sm:w-72 [&_input]:h-9" />
                        <ViewSwitch current={layout} options={[
                            { key: 'table', label: 'Table', icon: <ListIcon size={15} strokeWidth={1.8} />, href: `/desk/contacts?${params({ layout: 'table' })}` },
                            { key: 'cards', label: 'Cards', icon: <LayoutGrid size={15} strokeWidth={1.8} />, href: `/desk/contacts?${params({ layout: 'cards' })}` },
                        ]} />
                    </div>

                    {contacts.data.length === 0 ? (
                        <Panel>
                            <EmptyState icon={<Users size={22} strokeWidth={1.8} />} title={filtered ? 'No one matches' : 'No contacts yet'}
                                action={filtered ? <Link href="/desk/contacts" className="v-btn v-btn--quiet">Clear filters</Link> : undefined}>
                                {filtered ? 'Try a shorter search, or a different stage.' : 'A contact is created the first time someone calls, texts or emails. Nothing to add by hand.'}
                            </EmptyState>
                        </Panel>
                    ) : layout === 'cards' ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {contacts.data.map((c) => <ContactCard key={c.id} c={c} onFavorite={() => toggleFavorite(c.id)} />)}
                        </div>
                    ) : (
                        <DataTable minWidth={900} head={
                            <>
                                <HeadCell width={56}><span className="sr-only">Starred</span></HeadCell>
                                <HeadCell>Name</HeadCell>
                                <HeadCell width={140}>Stage</HeadCell>
                                <HeadCell width={130}>Channels</HeadCell>
                                <HeadCell width={200}>Reach</HeadCell>
                                <HeadCell width={180} className="hidden 2xl:table-cell">Owner</HeadCell>
                                <HeadCell width={90} align="right">Threads</HeadCell>
                                <HeadCell width={120} align="right">Last activity</HeadCell>
                            </>
                        }>
                            {contacts.data.map((c) => (
                                <TableRow key={c.id} onOpen={() => router.visit(`/desk/contacts/${c.id}`)}>
                                    <Cell><FavoriteButton on={c.is_favorite} onClick={() => toggleFavorite(c.id)} /></Cell>
                                    <Cell className="w-full max-w-0">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar name={c.name} initials={c.initials} size={32} />
                                            <div className="min-w-0 leading-tight">
                                                <Link href={`/desk/contacts/${c.id}`} className="block truncate text-base font-medium text-primary hover:underline"><UserText>{c.name}</UserText></Link>
                                                <span className="block truncate text-xs text-tertiary">{c.company ?? 'No company'}</span>
                                            </div>
                                        </div>
                                    </Cell>
                                    <Cell><Badge tone={c.stage_tone} dot>{c.stage_label}</Badge></Cell>
                                    <Cell><ChannelMarks channels={c.channels ?? []} /></Cell>
                                    <Cell className="max-w-[200px] text-secondary"><span className="block truncate tabular-nums">{c.phone ?? c.email ?? '—'}</span></Cell>
                                    <Cell className="hidden max-w-[180px] 2xl:table-cell">{c.owner ? <span className="flex min-w-0 items-center gap-2"><Avatar name={c.owner} initials={initialsOf(c.owner)} size={24} /><span className="truncate text-secondary">{c.owner}</span></span> : <span className="text-tertiary">Unassigned</span>}</Cell>
                                    <Cell align="right" className="text-secondary tabular-nums">{c.conversations_count}</Cell>
                                    <Cell align="right">{c.last_contact_at ? <RelativeTime at={c.last_contact_at} /> : <span className="text-xs text-tertiary">Never</span>}</Cell>
                                </TableRow>
                            ))}
                        </DataTable>
                    )}

                    <PageLinks links={contacts.links} summary={contacts.from && contacts.to ? `${contacts.from}–${contacts.to} of ${contacts.total.toLocaleString()}` : undefined} />
                </section>
            </DeskPage>
        </>
    );
}

function FavoriteButton({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={on} aria-label={on ? 'Unstar' : 'Star'} title={on ? 'Unstar' : 'Star'}
            className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-surface-hover"
            style={{ color: on ? 'var(--warning-fill)' : 'var(--text-disabled)' }}>
            <Star size={16} strokeWidth={1.8} fill={on ? 'currentColor' : 'none'} />
        </button>
    );
}

function ContactCard({ c, onFavorite }: { c: ContactRow; onFavorite: () => void }) {
    return (
        <div className="v-panel v-card-hover relative flex flex-col p-6">
            <div className="absolute top-4 right-4"><FavoriteButton on={c.is_favorite} onClick={onFavorite} /></div>
            <Link href={`/desk/contacts/${c.id}`} className="flex flex-1 flex-col">
                <Avatar name={c.name} initials={c.initials} size={48} />
                <div className="mt-4 truncate pr-8 text-md font-semibold text-primary"><UserText>{c.name}</UserText></div>
                <div className="truncate text-sm text-tertiary">{c.company ?? 'No company'}</div>
                <div className="mt-4 flex items-center gap-2">
                    <Badge tone={c.stage_tone} dot>{c.stage_label}</Badge>
                    <ChannelMarks channels={c.channels ?? []} />
                </div>
                <div className="mt-5 flex items-center justify-between gap-2 pt-4 text-xs text-tertiary" style={{ borderTop: '1px solid var(--separator)' }}>
                    <span className="truncate">{c.owner ?? 'Unassigned'} · {c.conversations_count} thread{c.conversations_count === 1 ? '' : 's'}</span>
                    <RelativeTime at={c.last_contact_at} />
                </div>
            </Link>
        </div>
    );
}
