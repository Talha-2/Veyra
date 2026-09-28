import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Phone, PhoneCall, Radio } from 'lucide-react';
import { useState } from 'react';

import { Cell, DataTable, HeadCell, TableRow } from '../../components/desk-pages/collection';
import { clockTime, isToday } from '../../components/desk-pages/format';
import { DeskPage, MetricTile, Panel } from '../../components/desk-pages/layout';
import { Callout, IconTile, SearchField } from '../../components/ui/kit';
import { PageHeader, Segmented } from '../../components/ui/page';
import { Badge, EmptyState, Mono, RelativeTime, StatusDot, UserText } from '../../components/ui/primitives';

interface CallRow {
    id: number; at: string; direction: string; from: string | null; to: string | null; line: string | null;
    contact: { id: number; name: string } | null; status: string; live: boolean; duration: string; language: string | null;
    summary: string | null; p95: number | null; delegations: number; tool_calls: number; needs_review: boolean;
}
interface Props {
    calls: { data: CallRow[]; next_page_url: string | null; prev_page_url: string | null; total: number };
    view: string; filters: { search: string | null }; counts: Record<string, number>;
}

/** The p95 budget from ARCHITECTURE.md: past this, callers hear the pause. */
const P95_BUDGET = 1800;

/**
 * The call log. "Needs review" is the view that matters: calls where a
 * durable action timed out and nobody knows whether it happened.
 */
export default function Calls({ calls, view, filters, counts }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const go = (patch: Record<string, string | undefined>) => router.get('/desk/calls', { view, search: filters.search || undefined, ...patch }, { preserveState: true, replace: true });

    return (
        <>
            <Head title="Calls" />
            <DeskPage width="wide" header={<PageHeader title="Calls" description="Every call the agent took, what was said, and what it did about it." />}>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile href="/desk/calls?view=today" label="Today" icon={<CalendarDays size={15} strokeWidth={1.8} />} value={counts.today ?? 0} hint="Calls since midnight" />
                    <MetricTile href="/desk/calls?view=review" label="Needs review" icon={<AlertTriangle size={15} strokeWidth={1.8} />} value={counts.review ?? 0} tone={(counts.review ?? 0) > 0 ? 'var(--danger)' : undefined}
                        hint={(counts.review ?? 0) > 0 ? 'An action timed out: check before calling back' : 'Every action completed or clearly failed'} />
                    <MetricTile href="/desk/calls?view=live" label="Live now" icon={<Radio size={15} strokeWidth={1.8} />} value={counts.live ?? 0} tone={(counts.live ?? 0) > 0 ? 'var(--accent)' : undefined}
                        trend={(counts.live ?? 0) > 0 ? <StatusDot tone="accent" live label="Calls in progress" /> : undefined}
                        hint={(counts.live ?? 0) > 0 ? 'Ringing or in progress' : 'No one on the line'} />
                    <MetricTile href="/desk/calls?view=all" label="All calls" icon={<Phone size={15} strokeWidth={1.8} />} value={(counts.all ?? 0).toLocaleString()} hint="Since the line was connected" />
                </div>

                <section className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-3">
                    <Segmented className="" current={view} hrefFor={(k) => `/desk/calls?view=${k}`} options={[
                        { key: 'all', label: 'All', count: counts.all }, { key: 'today', label: 'Today', count: counts.today },
                        { key: 'review', label: 'Needs review', count: counts.review }, { key: 'live', label: 'Live', count: counts.live },
                    ]} />
                    <div className="flex-1" />
                    <form onSubmit={(e) => { e.preventDefault(); go({ search: search || undefined }); }} className="w-full sm:w-auto" role="search">
                        <SearchField value={search} onChange={(v) => { setSearch(v); if (!v && filters.search) go({ search: undefined }); }} placeholder="Number or name, then Enter" className="w-full sm:w-72 [&_input]:h-9" />
                    </form>
                </div>

                {view === 'review' && counts.review > 0 && (
                    <Callout tone="danger" icon={<AlertTriangle size={16} strokeWidth={2} />} title="Check the other system before calling back">
                        On each of these, an action that changes something outside timed out. It may or may not have happened.
                    </Callout>
                )}

                {calls.data.length === 0 ? (
                    <Panel>
                        <EmptyState icon={<Phone size={20} strokeWidth={1.8} />} title={view === 'review' ? 'Nothing needs review' : filters.search ? 'No calls match' : 'No calls here'}>
                            {view === 'review' ? 'Every durable action on every call either completed or definitely failed. That is the healthy state.' : filters.search ? 'Try the last four digits of the number.' : 'Calls appear as the agent answers them.'}
                        </EmptyState>
                    </Panel>
                ) : (
                    <DataTable minWidth={900} head={
                        <>
                            <HeadCell width={240}>Caller</HeadCell>
                            <HeadCell>What happened</HeadCell>
                            <HeadCell width={160} className="hidden 2xl:table-cell">Line</HeadCell>
                            <HeadCell width={84} align="right">Length</HeadCell>
                            <HeadCell width={96} align="right">Handoffs</HeadCell>
                            <HeadCell width={84} align="right">p95</HeadCell>
                            <HeadCell width={110}>Status</HeadCell>
                            <HeadCell width={96} align="right">When</HeadCell>
                        </>
                    }>
                        {calls.data.map((c) => (
                            <TableRow key={c.id} onOpen={() => router.visit(`/desk/calls/${c.id}`)}>
                                <Cell>
                                    <div className="flex items-center gap-3 py-2">
                                        <IconTile tone={c.needs_review ? 'danger' : c.live ? 'accent' : 'muted'} size={32}>
                                            {c.needs_review ? <AlertTriangle size={15} strokeWidth={1.8} /> : c.live ? <PhoneCall size={15} strokeWidth={1.8} /> : c.direction === 'inbound' ? <ArrowDownLeft size={15} strokeWidth={1.8} /> : <ArrowUpRight size={15} strokeWidth={1.8} />}
                                        </IconTile>
                                        <div className="min-w-0">
                                            {c.contact
                                                ? <Link href={`/desk/contacts/${c.contact.id}`} className="block max-w-[200px] truncate text-base font-medium text-primary hover:underline"><UserText>{c.contact.name}</UserText></Link>
                                                : <span className="block max-w-[200px] truncate text-base font-medium text-primary tabular-nums">{c.from ?? 'Unknown caller'}</span>}
                                            <span className="block text-xs text-tertiary tabular-nums">{c.direction === 'inbound' ? 'Inbound' : 'Outbound'}{c.contact && c.from ? ` · ${c.from}` : ''}</span>
                                        </div>
                                    </div>
                                </Cell>
                                <Cell className="w-full max-w-0">
                                    <span className="line-clamp-2 text-sm" style={{ color: c.summary ? 'var(--text-secondary)' : 'var(--text-tertiary)' }} dir="auto">
                                        {c.summary ?? (c.live ? <span className="v-shimmer">In progress…</span> : 'No summary')}
                                    </span>
                                </Cell>
                                <Cell className="hidden text-secondary 2xl:table-cell">
                                    <span className="block max-w-[160px] truncate">{c.line ?? c.to ?? '—'}</span>
                                    {c.language && c.language !== 'en' && <Mono>{c.language}</Mono>}
                                </Cell>
                                <Cell align="right" className="text-secondary tabular-nums">{c.duration}</Cell>
                                <Cell align="right" className="text-secondary">
                                    <span className="tabular-nums">{c.delegations}</span>
                                    {c.tool_calls > 0 && <span className="block text-xs text-tertiary tabular-nums">{c.tool_calls} tool{c.tool_calls === 1 ? '' : 's'}</span>}
                                </Cell>
                                <Cell align="right">
                                    <span className="text-sm font-medium tabular-nums" style={{ color: c.p95 && c.p95 > P95_BUDGET ? 'var(--warning)' : c.p95 ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
                                        title={c.p95 && c.p95 > P95_BUDGET ? `Over the ${P95_BUDGET}ms budget` : undefined}>
                                        {c.p95 ? `${c.p95}ms` : '—'}
                                    </span>
                                </Cell>
                                <Cell>
                                    {c.live
                                        ? <Badge tone="accent" dot>Live</Badge>
                                        : c.needs_review
                                            ? <Badge tone="danger" dot>Review</Badge>
                                            : <Badge tone={c.status === 'completed' ? 'success' : c.status === 'failed' ? 'danger' : 'muted'}>{c.status}</Badge>}
                                </Cell>
                                <Cell align="right">
                                    {isToday(c.at)
                                        ? <time dateTime={c.at} title={new Date(c.at).toLocaleString()} className="text-xs text-tertiary tabular-nums whitespace-nowrap">{clockTime(c.at)}</time>
                                        : <RelativeTime at={c.at} />}
                                </Cell>
                            </TableRow>
                        ))}
                    </DataTable>
                )}

                {(calls.prev_page_url || calls.next_page_url || calls.data.length > 0) && (
                    <div className="flex items-center justify-between px-1">
                        <span className="text-sm text-tertiary tabular-nums">{calls.total.toLocaleString()} call{calls.total === 1 ? '' : 's'}</span>
                        <span className="flex gap-2">
                            {calls.prev_page_url && <Link href={calls.prev_page_url} className="v-btn v-btn--quiet v-btn--sm"><ChevronLeft size={14} strokeWidth={2} />Newer</Link>}
                            {calls.next_page_url && <Link href={calls.next_page_url} className="v-btn v-btn--quiet v-btn--sm">Older<ChevronRight size={14} strokeWidth={2} /></Link>}
                        </span>
                    </div>
                )}
                </section>
            </DeskPage>
        </>
    );
}
