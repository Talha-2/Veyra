import { Head, Link, router, useForm } from '@inertiajs/react';
import { Bot, CircleDot, Flag, Plus, Ticket as TicketIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import Kanban from '../../components/desk/kanban';
import { AvatarStack, FieldError, PeoplePicker } from '../../components/desk-inbox/controls';
import {
    BulkAssign, BulkBar, BulkPick, Cell, Checkbox, DataTable, FiltersPopover, GroupHeader, HeadCell, Pager, SortHead, StatusPill, TableRow, useFolded, useSelection, ViewModeSwitch,
    type SortDir, type ViewMode,
} from '../../components/desk-pages/collection';
import { DeskPage, Panel } from '../../components/desk-pages/layout';
import Dialog from '../../components/ui/dialog';
import { SearchField } from '../../components/ui/kit';
import { PageHeader, Segmented } from '../../components/ui/page';
import { Badge, EmptyState, Mono, RelativeTime, UserText, toneColor, type Tone } from '../../components/ui/primitives';

interface TicketRow {
    id: number; reference: string; subject: string; status: string; status_label: string; status_tone: Tone;
    priority: string; priority_label: string; priority_tone: Tone; position: number;
    type: { id: number; name: string; color: string } | null; created_by_agent: boolean;
    contact: { id: number; name: string } | null; assignees: { id: number; name: string }[];
    created_at?: string | null; updated_at: string | null;
}
interface Props {
    tickets: {
        data: TicketRow[]; total?: number;
        // Present on the paginated table, absent on the board and the list.
        current_page?: number; last_page?: number; from?: number | null; to?: number | null;
        prev_page_url?: string | null; next_page_url?: string | null;
    };
    scope: 'open' | 'mine' | 'agent' | 'resolved';
    layout: ViewMode;
    sort: { key: string | null; dir: SortDir };
    filters: { search: string | null; type: string | null; priority: string | null };
    counts: Record<string, number>;
    statuses: { value: string; label: string; tone: Tone }[];
    priorities: { value: string; label: string; tone: Tone }[];
    types: { id: number; name: string; color: string }[];
    team: { id: number; name: string }[];
}

const TERMINAL = ['resolved', 'closed'];

/**
 * Tickets as a board (drag between statuses), a list grouped by status, or a
 * sortable table with bulk actions. The view, the scope and every filter live
 * in the URL, so any of them is a link someone can share.
 */
export default function Tickets({ tickets, scope, layout, sort, filters, counts, statuses, priorities, types, team }: Props) {
    const [creating, setCreating] = useState<{ status?: string } | null>(null);
    const [term, setTerm] = useState(filters.search ?? '');

    const params = (patch: Record<string, string | undefined> = {}) => {
        const all: Record<string, string | undefined> = {
            view: layout, scope: scope === 'open' ? undefined : scope,
            search: filters.search || undefined, type: filters.type || undefined, priority: filters.priority || undefined,
            sort: layout === 'table' ? sort.key ?? undefined : undefined, dir: layout === 'table' && sort.key ? sort.dir : undefined,
            ...patch,
        };
        return Object.fromEntries(Object.entries(all).filter((e): e is [string, string] => !!e[1]));
    };
    const q = (patch: Record<string, string | undefined>) => router.get('/desk/tickets', params(patch), { preserveState: true, preserveScroll: true, replace: true });
    const href = (patch: Record<string, string | undefined>) => `/desk/tickets?${new URLSearchParams(params(patch)).toString()}`;

    useEffect(() => {
        if ((filters.search ?? '') === term) return;
        const t = setTimeout(() => q({ search: term || undefined }), 250);
        return () => clearTimeout(t);
    }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

    const columns = statuses
        .filter((s) => scope === 'resolved' ? TERMINAL.includes(s.value) : !TERMINAL.includes(s.value))
        .map((s) => ({ id: s.value, name: s.label, color: toneColor(s.tone), tone: s.tone }));
    const filtered = !!(filters.search || filters.type || filters.priority);
    const moreFilters = (filters.type ? 1 : 0) + (filters.priority ? 1 : 0);
    const setStatus = (id: number, status: string) => router.patch(`/desk/tickets/${id}`, { status }, { preserveScroll: true });

    return (
        <>
            <Head title="Tickets" />
            <DeskPage width="wide" header={
                <PageHeader title="Tickets" description="Everything the team or the agent has promised to follow up, until it is resolved."
                    meta={(counts.urgent ?? 0) > 0 && scope !== 'resolved' ? (
                        <Link href={href({ scope: undefined, priority: 'urgent' })} preserveScroll className="rounded-full transition-opacity hover:opacity-80">
                            <Badge tone="danger" dot>{counts.urgent} urgent</Badge>
                        </Link>
                    ) : undefined}
                    actions={<button type="button" className="v-btn v-btn--primary" onClick={() => setCreating({})}><Plus size={15} strokeWidth={2} />New ticket</button>} />
            }>
                <section className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <Segmented className="" current={scope} hrefFor={(key) => href({ scope: key === 'open' ? undefined : key })} options={[
                            { key: 'open', label: 'Open', count: counts.open }, { key: 'mine', label: 'Mine', count: counts.mine },
                            { key: 'agent', label: 'Raised by agent', count: counts.agent }, { key: 'resolved', label: 'Resolved' },
                        ]} />
                        <div className="flex-1" />
                        <SearchField value={term} onChange={setTerm} placeholder="Search tickets" className="w-full sm:w-64 [&_input]:h-9" />
                        <FiltersPopover active={moreFilters} onClear={() => q({ type: undefined, priority: undefined })}>
                            <FilterField label="Type" value={filters.type ?? ''} onChange={(v) => q({ type: v || undefined })}
                                options={[{ value: '', label: 'All types' }, ...types.map((t) => ({ value: String(t.id), label: t.name }))]} />
                            <FilterField label="Priority" value={filters.priority ?? ''} onChange={(v) => q({ priority: v || undefined })}
                                options={[{ value: '', label: 'All priorities' }, ...priorities.map((p) => ({ value: p.value, label: p.label }))]} />
                        </FiltersPopover>
                        <ViewModeSwitch current={layout} hrefFor={(mode) => href({ view: mode, sort: undefined, dir: undefined })} />
                    </div>

                    {tickets.data.length === 0 && (layout !== 'board' || filtered) ? (
                        <Panel>
                            <EmptyState icon={<TicketIcon size={22} strokeWidth={1.8} />} title={filtered ? 'No tickets match' : 'No tickets here'}
                                action={filtered
                                    ? <Link href={`/desk/tickets?${new URLSearchParams(params({ search: undefined, type: undefined, priority: undefined })).toString()}`} className="v-btn v-btn--quiet">Clear filters</Link>
                                    : <button type="button" className="v-btn v-btn--quiet" onClick={() => setCreating({})}><Plus size={15} strokeWidth={2} />New ticket</button>}>
                                {filtered ? 'Nothing matches this search and these filters.'
                                    : scope === 'agent' ? 'The agent has not raised anything that is still open. That is the healthy state.'
                                        : 'Tickets appear when the team or the agent raises one, from a conversation or here.'}
                            </EmptyState>
                        </Panel>
                    ) : layout === 'board' ? (
                        <Kanban columns={columns} cards={tickets.data.map((t) => ({ ...t, columnId: t.status }))}
                            onMove={(id, status, position) => router.patch(`/desk/tickets/${id}`, { status, position }, { preserveScroll: true })}
                            onAdd={(col) => setCreating({ status: String(col.id) })} addLabel="Add ticket" emptyLabel="No tickets"
                            renderCard={(t) => <TicketCard ticket={t} />} />
                    ) : layout === 'list' ? (
                        <GroupedList tickets={tickets.data} columns={columns} statuses={statuses} onStatus={setStatus} onAdd={(status) => setCreating({ status })} />
                    ) : (
                        <TicketTable tickets={tickets} statuses={statuses} priorities={priorities} team={team} sort={sort}
                            onSort={(key, dir) => q({ sort: key, dir })} onStatus={setStatus} />
                    )}
                </section>
            </DeskPage>
            <NewTicketDialog open={creating !== null} status={creating?.status} onClose={() => setCreating(null)} types={types} team={team} priorities={priorities} statuses={statuses} />
        </>
    );
}

function FilterField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    const id = `f-${label.toLowerCase()}`;
    return (
        <div>
            <label htmlFor={id} className="v-label">{label}</label>
            <select id={id} className="v-field" value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
}

function TypeLabel({ type }: { type: { name: string; color: string } }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap">
            <span className="size-2 shrink-0 rounded-full" style={{ background: type.color }} aria-hidden="true" />
            <span className="truncate">{type.name}</span>
        </span>
    );
}

function Assigned({ people }: { people: { id: number; name: string }[] }) {
    if (people.length === 0) return <span className="text-sm text-tertiary">Unassigned</span>;
    return (
        <span className="flex min-w-0 items-center gap-2">
            <AvatarStack people={people} size={24} />
            <span className="truncate text-sm text-secondary">{people.length === 1 ? people[0].name : `${people.length} people`}</span>
        </span>
    );
}

// ── board ────────────────────────────────────────────────────────────────

function TicketCard({ ticket: t }: { ticket: TicketRow }) {
    const meta = [t.reference, t.contact?.name].filter(Boolean).join(' · ');

    return (
        <Link href={`/desk/tickets/${t.id}`} draggable={false} className="v-panel v-card-hover block px-4 pt-3.5 pb-3.5">
            <div className="line-clamp-2 text-base font-medium text-primary"><UserText>{t.subject}</UserText></div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-tertiary">
                <span className="truncate"><UserText>{meta}</UserText></span>
                {t.type && <><span aria-hidden="true">·</span><TypeLabel type={t.type} /></>}
            </div>
            <div className="mt-3.5 flex items-center gap-1.5">
                <Badge tone={t.priority_tone} dot>{t.priority_label}</Badge>
                {t.created_by_agent && <Badge tone="accent"><Bot size={11} strokeWidth={2.2} aria-hidden="true" />Agent</Badge>}
                <span className="flex-1" />
                <AvatarStack people={t.assignees} size={24} max={3} />
            </div>
        </Link>
    );
}

// ── list ─────────────────────────────────────────────────────────────────

function GroupedList({ tickets, columns, statuses, onStatus, onAdd }: {
    tickets: TicketRow[]; columns: { id: string; name: string; color: string }[]; statuses: Props['statuses'];
    onStatus: (id: number, status: string) => void; onAdd: (status: string) => void;
}) {
    const [folded, toggle] = useFolded('desk:tickets:folded');

    return (
        <div className="flex flex-col gap-6">
            {columns.map((col) => {
                const rows = tickets.filter((t) => t.status === col.id);
                const open = !folded.has(col.id);
                return (
                    <Panel key={col.id} className="overflow-hidden">
                        <GroupHeader open={open} onToggle={() => toggle(col.id)} color={col.color} title={col.name} count={rows.length}
                            action={<button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => onAdd(col.id)}><Plus size={14} strokeWidth={2} />Add</button>} />
                        {open && (rows.length === 0 ? (
                            <p className="px-7 py-5 text-sm text-tertiary">No tickets are {col.name.toLowerCase()}.</p>
                        ) : (
                            <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                                {rows.map((t) => (
                                    <div key={t.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,select')) router.visit(`/desk/tickets/${t.id}`); }}
                                        className="grid h-14 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-6 transition-colors hover:bg-surface-hover lg:grid-cols-[minmax(0,1fr)_110px_190px_96px_150px]">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="min-w-0">
                                                <Link href={`/desk/tickets/${t.id}`} className="flex min-w-0 items-center gap-1.5 text-base font-medium text-primary">
                                                    {t.created_by_agent && <Bot size={14} strokeWidth={2} className="shrink-0 text-accent" aria-label="Raised by the agent" />}
                                                    <span className="truncate"><UserText>{t.subject}</UserText></span>
                                                </Link>
                                                <div className="flex min-w-0 items-center gap-1.5 text-xs text-tertiary">
                                                    <Mono>{t.reference}</Mono>
                                                    {t.contact && <><span aria-hidden="true">·</span><span className="truncate"><UserText>{t.contact.name}</UserText></span></>}
                                                    {t.type && <><span aria-hidden="true">·</span><TypeLabel type={t.type} /></>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="hidden lg:block"><Badge tone={t.priority_tone} dot>{t.priority_label}</Badge></div>
                                        <div className="hidden min-w-0 lg:block"><Assigned people={t.assignees} /></div>
                                        <div className="hidden text-right lg:block"><RelativeTime at={t.updated_at} /></div>
                                        <div className="flex justify-end">
                                            <StatusPill value={t.status} tone={t.status_tone} label={`Status for ${t.reference}`} options={statuses} onChange={(s) => onStatus(t.id, s)} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </Panel>
                );
            })}
        </div>
    );
}

// ── table ────────────────────────────────────────────────────────────────

function TicketTable({ tickets, statuses, priorities, team, sort, onSort, onStatus }: {
    tickets: Props['tickets']; statuses: Props['statuses']; priorities: Props['priorities']; team: Props['team'];
    sort: Props['sort']; onSort: (key: string, dir: SortDir) => void; onStatus: (id: number, status: string) => void;
}) {
    const ids = useMemo(() => tickets.data.map((t) => t.id), [tickets.data]);
    const sel = useSelection(ids);
    const bulk = (data: Record<string, unknown>) =>
        router.post('/desk/tickets/bulk', { ids: [...sel.selected], ...data }, { preserveScroll: true, onSuccess: () => sel.clear() });
    const head = { current: sort.key, dir: sort.dir, onSort };

    return (
        <div className="flex flex-col gap-5">
            <DataTable minWidth={900} head={
                <>
                    <HeadCell width={52}><Checkbox checked={sel.all} indeterminate={sel.some} onChange={sel.toggleAll} label="Select all on this page" /></HeadCell>
                    <SortHead label="Ticket" sortKey="subject" {...head} />
                    <SortHead label="Ref" sortKey="reference" {...head} width={80} className="hidden 2xl:table-cell" />
                    <HeadCell width={170}>Contact</HeadCell>
                    <HeadCell width={150} className="hidden 2xl:table-cell">Type</HeadCell>
                    <SortHead label="Priority" sortKey="priority" {...head} width={112} />
                    <SortHead label="Status" sortKey="status" {...head} width={156} />
                    <HeadCell width={180}>Assigned</HeadCell>
                    <SortHead label="Updated" sortKey="updated" {...head} align="right" width={108} />
                </>
            }>
                {tickets.data.map((t) => (
                    <TableRow key={t.id} selected={sel.has(t.id)} onOpen={() => router.visit(`/desk/tickets/${t.id}`)}>
                        <Cell><Checkbox checked={sel.has(t.id)} onChange={(v) => sel.toggle(t.id, v)} label={`Select ${t.reference}`} /></Cell>
                        <Cell className="w-full max-w-0">
                            <Link href={`/desk/tickets/${t.id}`} className="flex min-w-0 items-center gap-2 text-base font-medium text-primary">
                                <Mono className="2xl:hidden">{t.reference}</Mono>
                                {t.created_by_agent && <Bot size={14} strokeWidth={2} className="shrink-0 text-accent" aria-label="Raised by the agent" />}
                                <span className="truncate"><UserText>{t.subject}</UserText></span>
                            </Link>
                        </Cell>
                        <Cell className="hidden 2xl:table-cell"><Mono>{t.reference}</Mono></Cell>
                        <Cell className="max-w-[170px]">
                            {t.contact
                                ? <Link href={`/desk/contacts/${t.contact.id}`} className="block truncate text-secondary hover:text-accent-text"><UserText>{t.contact.name}</UserText></Link>
                                : <span className="text-tertiary">—</span>}
                        </Cell>
                        <Cell className="hidden max-w-[150px] text-secondary 2xl:table-cell">{t.type ? <TypeLabel type={t.type} /> : <span className="text-tertiary">—</span>}</Cell>
                        <Cell><Badge tone={t.priority_tone} dot>{t.priority_label}</Badge></Cell>
                        <Cell><StatusPill value={t.status} tone={t.status_tone} label={`Status for ${t.reference}`} options={statuses} onChange={(s) => onStatus(t.id, s)} /></Cell>
                        <Cell className="max-w-[180px]"><Assigned people={t.assignees} /></Cell>
                        <Cell align="right"><RelativeTime at={t.updated_at} /></Cell>
                    </TableRow>
                ))}
            </DataTable>

            <Pager from={tickets.from} to={tickets.to} total={tickets.total} prev={tickets.prev_page_url} next={tickets.next_page_url} current={tickets.current_page} last={tickets.last_page} />

            <BulkBar count={sel.count} noun={['ticket', 'tickets']} onClear={sel.clear}>
                <BulkPick label="Status" icon={<CircleDot size={14} strokeWidth={1.9} />} onPick={(status) => bulk({ status })}
                    options={statuses.map((s) => ({ value: s.value, label: s.label, color: toneColor(s.tone) }))} />
                <BulkPick label="Priority" icon={<Flag size={14} strokeWidth={1.9} />} onPick={(priority) => bulk({ priority })}
                    options={priorities.map((p) => ({ value: p.value, label: p.label, color: toneColor(p.tone) }))} />
                <BulkAssign team={team} onApply={(ids) => bulk({ assignee_ids: ids })} />
            </BulkBar>
        </div>
    );
}

// ── create ───────────────────────────────────────────────────────────────

function NewTicketDialog({ open, status, onClose, types, team, priorities, statuses }: {
    open: boolean; status?: string; onClose: () => void; types: Props['types']; team: Props['team']; priorities: Props['priorities']; statuses: Props['statuses'];
}) {
    const { data, setData, post, processing, errors, reset, transform } = useForm({ subject: '', body: '', priority: 'normal', ticket_type_id: '', assignee_ids: [] as number[] });
    transform((d) => ({ ...d, status: status ?? undefined }));
    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/tickets', { onSuccess: () => { reset(); onClose(); } }); };
    const startsIn = status ? statuses.find((s) => s.value === status) : undefined;

    return (
        <Dialog open={open} onClose={onClose} title="New ticket" width={620}
            description={startsIn ? `For a follow-up that did not start in a conversation. It starts as ${startsIn.label.toLowerCase()}.` : 'For a follow-up that did not start in a conversation.'}>
            <form onSubmit={submit} className="flex flex-col gap-5">
                <div>
                    <label htmlFor="nt-subject" className="v-label">Subject</label>
                    <input id="nt-subject" className="v-field" value={data.subject} onChange={(e) => setData('subject', e.target.value)} dir="auto" autoFocus placeholder="What needs doing, in a few words" />
                    <FieldError>{errors.subject}</FieldError>
                </div>
                <div>
                    <label htmlFor="nt-body" className="v-label flex items-baseline justify-between">Details <span className="text-xs font-normal text-tertiary">Optional</span></label>
                    <textarea id="nt-body" className="v-field text-md" rows={5} value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto"
                        placeholder="What was asked, what was promised, anything the next person needs." />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                        <label htmlFor="nt-priority" className="v-label">Priority</label>
                        <select id="nt-priority" className="v-field" value={data.priority} onChange={(e) => setData('priority', e.target.value)}>{priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
                    </div>
                    <div>
                        <label htmlFor="nt-type" className="v-label">Type</label>
                        <select id="nt-type" className="v-field" value={data.ticket_type_id} onChange={(e) => setData('ticket_type_id', e.target.value)}><option value="">None</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                    </div>
                </div>
                <div>
                    <span className="v-label flex items-baseline justify-between">Assign <span className="text-xs font-normal text-tertiary">Empty uses the type's default people</span></span>
                    <PeoplePicker team={team} value={data.assignee_ids} onChange={(ids) => setData('assignee_ids', ids)} maxHeight={200} />
                </div>
                <div className="mt-1 flex justify-end gap-2 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.subject.trim()}>{processing ? 'Creating…' : 'Create ticket'}</button>
                </div>
            </form>
        </Dialog>
    );
}
