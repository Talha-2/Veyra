import { Head, Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, Bot, ChevronDown, ChevronLeft, ChevronRight, CircleDot, KanbanSquare, List as ListIcon, Plus, Ticket as TicketIcon, User } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import Dialog from '../../components/ui/dialog';
import Kanban from '../../components/desk/kanban';
import { SearchField, StatTile, Toolbar } from '../../components/ui/kit';
import { Badge, EmptyState, Mono, RelativeTime, UserText, toneColor, type Tone } from '../../components/ui/primitives';
import { PageHeader, Row, Segmented, Table, Td, Th } from '../../components/ui/page';
import { AvatarStack, FieldError, PeoplePicker } from '../../components/desk-inbox/controls';

interface TicketRow {
    id: number; reference: string; subject: string; status: string; status_label: string; status_tone: Tone;
    priority: string; priority_label: string; priority_tone: Tone; position: number;
    type: { id: number; name: string; color: string } | null; created_by_agent: boolean;
    contact: { id: number; name: string } | null; assignees: { id: number; name: string }[]; updated_at: string | null;
}
interface Props {
    tickets: {
        data: TicketRow[]; total?: number;
        // Present on the paginated list layout, absent on the kanban.
        current_page?: number; last_page?: number; from?: number | null; to?: number | null;
        prev_page_url?: string | null; next_page_url?: string | null;
    };
    view: string; layout: 'list' | 'kanban';
    filters: { search: string | null; type: string | null; priority: string | null };
    counts: Record<string, number>;
    statuses: { value: string; label: string; tone: Tone }[];
    priorities: { value: string; label: string; tone: Tone }[];
    types: { id: number; name: string; color: string }[];
    team: { id: number; name: string }[];
}

const TONE_BG: Record<Tone, string> = {
    accent: 'var(--accent-subtle)', success: 'var(--success-subtle)', warning: 'var(--warning-subtle)',
    danger: 'var(--danger-subtle)', info: 'var(--info-subtle)', muted: 'var(--surface-sunken)',
};
const TONE_FG: Record<Tone, string> = {
    accent: 'var(--accent-text)', success: 'var(--success)', warning: 'var(--warning)',
    danger: 'var(--danger)', info: 'var(--info)', muted: 'var(--text-secondary)',
};

export default function Tickets({ tickets, view, layout, filters, counts, statuses, priorities, types, team }: Props) {
    const [creating, setCreating] = useState(false);
    const [term, setTerm] = useState(filters.search ?? '');

    const params = (patch: Record<string, string | undefined> = {}) => {
        const all: Record<string, string | undefined> = { view, layout, search: filters.search || undefined, type: filters.type || undefined, priority: filters.priority || undefined, ...patch };
        return Object.fromEntries(Object.entries(all).filter((e): e is [string, string] => !!e[1]));
    };
    const q = (patch: Record<string, string | undefined>) =>
        router.get('/desk/tickets', params(patch), { preserveState: true, preserveScroll: true, replace: true });
    const href = (patch: Record<string, string | undefined>) => `/desk/tickets?${new URLSearchParams(params(patch)).toString()}`;

    useEffect(() => {
        if ((filters.search ?? '') === term) return;
        const t = setTimeout(() => q({ search: term || undefined }), 250);
        return () => clearTimeout(t);
    }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

    const columns = statuses
        .filter((s) => view === 'resolved' ? ['resolved', 'closed'].includes(s.value) : !['resolved', 'closed'].includes(s.value))
        .map((s) => ({ id: s.value, name: s.label, color: toneColor(s.tone) }));
    const filtered = !!(filters.search || filters.type || filters.priority);

    return (
        <>
            <Head title="Tickets" />
            <div className="mx-auto max-w-350 px-8 py-8">
                <PageHeader title="Tickets" description="Everything the team or the agent has promised to follow up, until it is resolved."
                    actions={<button type="button" className="v-btn v-btn--primary" onClick={() => setCreating(true)}><Plus size={15} strokeWidth={2} />New ticket</button>} />

                <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <TileLink href={href({ view: 'open', priority: undefined })} active={view === 'open' && !filters.priority}>
                        <StatTile label="Open" value={counts.open ?? 0} icon={<CircleDot size={15} strokeWidth={1.9} />} hint="Not yet resolved or closed" />
                    </TileLink>
                    <TileLink href={href({ view: 'mine', priority: undefined })} active={view === 'mine'}>
                        <StatTile label="Assigned to me" value={counts.mine ?? 0} icon={<User size={15} strokeWidth={1.9} />} hint="Open and waiting on you" />
                    </TileLink>
                    <TileLink href={href({ view: 'agent', priority: undefined })} active={view === 'agent'}>
                        <StatTile label="Raised by agent" value={counts.agent ?? 0} icon={<Bot size={15} strokeWidth={1.9} />} tone={(counts.agent ?? 0) > 0 ? 'accent' : undefined}
                            hint="Promises the agent made on a call" />
                    </TileLink>
                    <TileLink href={href({ view: 'open', priority: 'urgent' })} active={view === 'open' && filters.priority === 'urgent'}>
                        <StatTile label="Urgent" value={counts.urgent ?? 0} icon={<AlertTriangle size={15} strokeWidth={1.9} />} tone={(counts.urgent ?? 0) > 0 ? 'danger' : undefined}
                            hint="Open at urgent priority" />
                    </TileLink>
                </div>

                <Toolbar trailing={
                    <>
                        <SearchField value={term} onChange={setTerm} placeholder="Search tickets" className="w-60" />
                        <PillSelect label="Type" value={filters.type ?? ''} onChange={(v) => q({ type: v || undefined })}
                            options={[{ value: '', label: 'All types' }, ...types.map((t) => ({ value: String(t.id), label: t.name }))]} />
                        <PillSelect label="Priority" value={filters.priority ?? ''} onChange={(v) => q({ priority: v || undefined })}
                            options={[{ value: '', label: 'All priorities' }, ...priorities.map((p) => ({ value: p.value, label: p.label }))]} />
                        <LayoutSwitch current={layout} hrefFor={(l) => href({ layout: l })} />
                    </>
                }>
                    <Segmented className="" current={view} hrefFor={(key) => href({ view: key })} options={[
                        { key: 'open', label: 'Open', count: counts.open }, { key: 'mine', label: 'Mine', count: counts.mine },
                        { key: 'agent', label: 'Raised by agent', count: counts.agent }, { key: 'resolved', label: 'Resolved' },
                    ]} />
                </Toolbar>

                {tickets.data.length === 0 ? (
                    <div className="v-panel">
                        <EmptyState icon={<TicketIcon size={22} strokeWidth={1.8} />} title={filtered ? 'No tickets match' : 'No tickets here'}
                            action={filtered
                                ? <Link href={`/desk/tickets?view=${view}&layout=${layout}`} className="v-btn v-btn--quiet">Clear filters</Link>
                                : <button type="button" className="v-btn v-btn--quiet" onClick={() => setCreating(true)}><Plus size={15} strokeWidth={2} />New ticket</button>}>
                            {filtered ? 'Nothing matches this search and these filters.'
                                : view === 'agent' ? 'The agent has not raised anything that is still open. That is the healthy state.'
                                    : 'Tickets appear when the team or the agent raises one, from a conversation or here.'}
                        </EmptyState>
                    </div>
                ) : layout === 'kanban' ? (
                    <Kanban columns={columns} cards={tickets.data.map((t) => ({ ...t, columnId: t.status }))}
                        onMove={(id, status, position) => router.patch(`/desk/tickets/${id}`, { status, position }, { preserveScroll: true })}
                        renderCard={(t) => <TicketCard ticket={t} />} />
                ) : (
                    <>
                        <Table head={<><Th>Ticket</Th><Th>Type</Th><Th>Priority</Th><Th>Status</Th><Th>Assigned</Th><Th align="right">Updated</Th></>}>
                            {tickets.data.map((t) => (
                                <Row key={t.id} href={`/desk/tickets/${t.id}`}>
                                    <Td>
                                        <div className="flex min-w-60 max-w-130 flex-col">
                                            <Link href={`/desk/tickets/${t.id}`} className="flex items-center gap-1.5 truncate font-medium text-primary">
                                                {t.created_by_agent && <Bot size={14} strokeWidth={2} className="shrink-0 text-accent" aria-label="Raised by the agent" />}
                                                <span className="truncate"><UserText>{t.subject}</UserText></span>
                                            </Link>
                                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-tertiary">
                                                <Mono>{t.reference}</Mono>
                                                {t.contact && (
                                                    <>
                                                        <span aria-hidden="true">·</span>
                                                        <Link href={`/desk/contacts/${t.contact.id}`} className="truncate hover:text-accent-text"><UserText>{t.contact.name}</UserText></Link>
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                    </Td>
                                    <Td muted>{t.type ? <TypeLabel type={t.type} /> : <span className="text-tertiary">—</span>}</Td>
                                    <Td><Badge tone={t.priority_tone} dot>{t.priority_label}</Badge></Td>
                                    <Td>
                                        <StatusPill value={t.status} tone={t.status_tone} label={`Status for ${t.reference}`} options={statuses}
                                            onChange={(status) => router.patch(`/desk/tickets/${t.id}`, { status }, { preserveScroll: true })} />
                                    </Td>
                                    <Td muted>
                                        {t.assignees.length > 0
                                            ? <span className="flex items-center gap-2"><AvatarStack people={t.assignees} size={22} /><span className="max-w-30 truncate text-sm">{t.assignees.length === 1 ? t.assignees[0].name : `${t.assignees.length} people`}</span></span>
                                            : <span className="text-tertiary">Unassigned</span>}
                                    </Td>
                                    <Td align="right"><RelativeTime at={t.updated_at} /></Td>
                                </Row>
                            ))}
                        </Table>
                        <Pagination tickets={tickets} />
                    </>
                )}
            </div>
            <NewTicketDialog open={creating} onClose={() => setCreating(false)} types={types} team={team} priorities={priorities} />
        </>
    );
}

function TileLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
    return (
        <Link href={href} preserveScroll aria-current={active ? 'page' : undefined}
            className="block rounded-lg transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-raised"
            style={{ boxShadow: active ? '0 0 0 2px var(--border-accent)' : undefined }}>
            {children}
        </Link>
    );
}

function TypeLabel({ type }: { type: { name: string; color: string } }) {
    return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="size-2 shrink-0 rounded-full" style={{ background: type.color }} aria-hidden="true" />
            {type.name}
        </span>
    );
}

/** A select dressed as a pill, for toolbar filters beside the search pill. */
function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <span className="relative inline-flex">
            <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
                className="h-8.5 cursor-pointer appearance-none rounded-full pr-8 pl-3.5 text-sm font-medium transition-colors hover:bg-surface-hover"
                style={{ background: value ? 'var(--accent-subtle)' : 'var(--surface)', color: value ? 'var(--accent-text)' : 'var(--text-primary)', border: `1px solid ${value ? 'transparent' : 'var(--border-strong)'}`, boxShadow: 'var(--shadow-xs)' }}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" style={{ color: value ? 'var(--accent-text)' : 'var(--text-tertiary)' }} />
        </span>
    );
}

/** Status as a tinted pill that is also a select, so a row can be moved on in place. */
function StatusPill({ value, tone, label, options, onChange }: { value: string; tone: Tone; label: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
    return (
        <span className="relative inline-flex">
            <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
                className="h-7 cursor-pointer appearance-none rounded-full pr-7 pl-5.5 text-xs font-medium"
                style={{ background: TONE_BG[tone], color: TONE_FG[tone], border: 'none' }}>
                {options.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="pointer-events-none absolute top-1/2 left-2.5 size-1.5 -translate-y-1/2 rounded-full" style={{ background: toneColor(tone) }} aria-hidden="true" />
            <ChevronDown size={12} strokeWidth={2.2} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2" style={{ color: TONE_FG[tone] }} />
        </span>
    );
}

function LayoutSwitch({ current, hrefFor }: { current: 'list' | 'kanban'; hrefFor: (layout: string) => string }) {
    const options = [
        { key: 'list', label: 'List', icon: <ListIcon size={15} strokeWidth={1.9} /> },
        { key: 'kanban', label: 'Board', icon: <KanbanSquare size={15} strokeWidth={1.9} /> },
    ];

    return (
        <div className="inline-flex items-center gap-0.5 rounded-[10px] p-0.75" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            {options.map((o) => {
                const active = o.key === current;
                return (
                    <Link key={o.key} href={hrefFor(o.key)} aria-label={o.label} title={o.label} aria-current={active ? 'page' : undefined}
                        className="flex h-7 w-8 items-center justify-center rounded-[8px] transition-all"
                        style={{ background: active ? 'var(--surface-raised)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: active ? 'var(--shadow-card)' : 'none' }}>
                        {o.icon}
                    </Link>
                );
            })}
        </div>
    );
}

function TicketCard({ ticket: t }: { ticket: TicketRow }) {
    return (
        <Link href={`/desk/tickets/${t.id}`} className="v-panel block p-3.5" draggable={false}>
            <div className="mb-1.5 flex items-center gap-1.5">
                <Mono>{t.reference}</Mono>
                {t.created_by_agent && <Bot size={14} strokeWidth={2} className="text-accent" aria-label="Raised by the agent" />}
                <span className="flex-1" />
                <Badge tone={t.priority_tone} dot>{t.priority_label}</Badge>
            </div>
            <div className="line-clamp-2 text-sm font-medium text-primary"><UserText>{t.subject}</UserText></div>
            <div className="mt-3 flex items-center gap-2 text-xs text-tertiary">
                {t.type && <TypeLabel type={t.type} />}
                <span className="min-w-0 flex-1 truncate">{t.contact && <UserText>{t.contact.name}</UserText>}</span>
                <AvatarStack people={t.assignees} size={20} max={2} />
            </div>
        </Link>
    );
}

function Pagination({ tickets }: { tickets: Props['tickets'] }) {
    if (!tickets.last_page || tickets.last_page <= 1) return null;

    return (
        <div className="mt-4 flex items-center justify-between gap-3 px-1">
            <span className="text-xs text-tertiary tabular-nums">{tickets.from}–{tickets.to} of {tickets.total}</span>
            <div className="flex items-center gap-1.5">
                <PageLink href={tickets.prev_page_url} label="Previous page"><ChevronLeft size={15} strokeWidth={2} /></PageLink>
                <span className="px-1 text-xs text-secondary tabular-nums">Page {tickets.current_page} of {tickets.last_page}</span>
                <PageLink href={tickets.next_page_url} label="Next page"><ChevronRight size={15} strokeWidth={2} /></PageLink>
            </div>
        </div>
    );
}

function PageLink({ href, label, children }: { href?: string | null; label: string; children: ReactNode }) {
    if (!href) return <span className="v-btn v-btn--quiet v-btn--icon rounded-full opacity-40" aria-disabled="true" aria-label={label}>{children}</span>;
    return <Link href={href} preserveScroll className="v-btn v-btn--quiet v-btn--icon rounded-full" aria-label={label} title={label}>{children}</Link>;
}

function NewTicketDialog({ open, onClose, types, team, priorities }: { open: boolean; onClose: () => void; types: Props['types']; team: Props['team']; priorities: Props['priorities'] }) {
    const { data, setData, post, processing, errors, reset } = useForm({ subject: '', body: '', priority: 'normal', ticket_type_id: '', assignee_ids: [] as number[] });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/tickets', { onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="New ticket" description="For follow-ups that did not start in a conversation." width={560}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <label htmlFor="nt-subject" className="v-label">Subject</label>
                    <input id="nt-subject" className="v-field" value={data.subject} onChange={(e) => setData('subject', e.target.value)} dir="auto" autoFocus />
                    <FieldError>{errors.subject}</FieldError>
                </div>
                <div>
                    <label htmlFor="nt-body" className="v-label flex items-baseline justify-between">Details <span className="text-xs font-normal text-tertiary">Optional</span></label>
                    <textarea id="nt-body" className="v-field h-auto py-2.5 text-base" rows={3} value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
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
                    <span className="v-label flex items-baseline justify-between">Assign <span className="text-xs font-normal text-tertiary">Leave empty to use the type's default people</span></span>
                    <PeoplePicker team={team} value={data.assignee_ids} onChange={(ids) => setData('assignee_ids', ids)} maxHeight={200} />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Creating…' : 'Create ticket'}</button>
                </div>
            </form>
        </Dialog>
    );
}
