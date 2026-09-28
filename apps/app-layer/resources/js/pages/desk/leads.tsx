import { Head, Link, router, useForm } from '@inertiajs/react';
import { CalendarClock, FileUp, KanbanSquare, Plus, Target, Trash2, Upload, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import Kanban from '../../components/desk/kanban';
import { AvatarStack } from '../../components/desk-pages/bits';
import {
    BulkAssign, BulkBar, BulkPick, Cell, Checkbox, DataTable, GroupHeader, HeadCell, PillSelect, SortHead, StatusPill, TableRow, useFolded, useSelection, ViewModeSwitch,
    type SortDir, type ViewMode,
} from '../../components/desk-pages/collection';
import { compactMoney, humanize, money } from '../../components/desk-pages/format';
import { DeskPage, Figure, Panel } from '../../components/desk-pages/layout';
import AssigneePicker from '../../components/ui/assignee-picker';
import Dialog from '../../components/ui/dialog';
import { SearchField, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, RelativeTime, UserText } from '../../components/ui/primitives';

interface Lead {
    id: number; contact: { id: number; name: string; initials: string; company: string | null; phone: string | null; email?: string | null } | null;
    stage_id: number | null; source: string; value: number; position: number; next_response_at: string | null; overdue: boolean;
    outreach_note: string | null; assignees: { id: number; name: string }[]; created_at?: string | null; updated_at: string | null;
}
type Stage = { id: number; name: string; color: string };
interface Props {
    view: ViewMode;
    pipeline: { id: number; name: string; stages: Stage[] } | null;
    pipelines: { id: number; name: string }[];
    leads: Lead[];
    filters: { search: string | null; source: string | null; mine: boolean };
    sources: string[];
    team: { id: number; name: string }[];
    totals: { count: number; value: number };
}

/**
 * Leads (Z360's Inquiries): contacts moving through a pipeline. A board to
 * drag them between stages, a list grouped by stage, or a sortable table with
 * bulk moves. The view lives in the URL next to the filters.
 */
export default function Leads({ view, pipeline, pipelines, leads, filters, sources, team, totals }: Props) {
    const [adding, setAdding] = useState<{ stageId?: number } | null>(null);
    const [importing, setImporting] = useState(false);
    const [term, setTerm] = useState(filters.search ?? '');

    const params = (patch: Record<string, string | undefined> = {}) => {
        const all: Record<string, string | undefined> = {
            view, pipeline: pipeline ? String(pipeline.id) : undefined, search: filters.search || undefined,
            source: filters.source || undefined, mine: filters.mine ? '1' : undefined, ...patch,
        };
        return Object.fromEntries(Object.entries(all).filter((e): e is [string, string] => !!e[1]));
    };
    const q = (patch: Record<string, string | undefined>) => router.get('/desk/leads', params(patch), { preserveState: true, preserveScroll: true, replace: true });
    const href = (patch: Record<string, string | undefined>) => `/desk/leads?${new URLSearchParams(params(patch)).toString()}`;

    useEffect(() => {
        if ((filters.search ?? '') === term) return;
        const t = setTimeout(() => q({ search: term || undefined }), 300);
        return () => clearTimeout(t);
    }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

    const overdue = leads.filter((l) => l.overdue).length;
    const filtered = !!(filters.search || filters.source || filters.mine);
    const moveTo = (lead: Lead, stageId: number) => {
        const position = leads.filter((l) => l.stage_id === stageId).length;
        router.post(`/desk/leads/${lead.id}/move`, { pipeline_stage_id: stageId, position }, { preserveScroll: true });
    };

    return (
        <>
            <Head title="Leads" />
            <DeskPage width="wide" header={
                <PageHeader
                    title="Leads"
                    description={pipeline ? `People moving through ${pipeline.name}.` : 'People moving through a pipeline.'}
                    actions={
                        <>
                            <button type="button" className="v-btn v-btn--quiet" onClick={() => setImporting(true)} disabled={!pipeline}><Upload size={14} strokeWidth={1.8} />Import CSV</button>
                            <button type="button" className="v-btn v-btn--primary" onClick={() => setAdding({})} disabled={!pipeline}><Plus size={15} strokeWidth={2} />New lead</button>
                        </>
                    }
                />
            }>
                {!pipeline ? (
                    <Panel>
                        <EmptyState icon={<KanbanSquare size={22} strokeWidth={1.8} />} title="No pipeline yet">
                            A pipeline is the set of stages a lead moves through. Create one in Studio settings, then leads can move through it here.
                        </EmptyState>
                    </Panel>
                ) : (
                    <>
                        <Summary stages={pipeline.stages} leads={leads} totals={totals} overdue={overdue} />

                        <section className="flex flex-col gap-6">
                            <div className="flex flex-wrap items-center gap-3">
                                {pipelines.length > 1 && (
                                    <PillSelect label="Pipeline" value={String(pipeline.id)} onChange={(v) => q({ pipeline: v })}
                                        options={pipelines.map((p) => ({ value: String(p.id), label: p.name }))} />
                                )}
                                <SegmentedControl<'all' | 'mine'> value={filters.mine ? 'mine' : 'all'} onChange={(v) => q({ mine: v === 'mine' ? '1' : undefined })}
                                    options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'Assigned to me' }]} />
                                <div className="flex-1" />
                                <SearchField value={term} onChange={setTerm} placeholder="Search leads" className="w-full sm:w-64 [&_input]:h-9" />
                                <PillSelect label="Source" value={filters.source ?? ''} onChange={(v) => q({ source: v || undefined })}
                                    options={[{ value: '', label: 'All sources' }, ...sources.map((s) => ({ value: s, label: humanize(s) }))]} />
                                <ViewModeSwitch current={view} hrefFor={(mode) => href({ view: mode })} />
                            </div>

                            {leads.length === 0 && (view !== 'board' || filtered) ? (
                                <Panel>
                                    <EmptyState icon={<Target size={22} strokeWidth={1.8} />} title={filtered ? 'No leads match' : 'No leads in this pipeline'}
                                        action={filtered
                                            ? <Link href={`/desk/leads?view=${view}&pipeline=${pipeline.id}`} className="v-btn v-btn--quiet">Clear filters</Link>
                                            : <button type="button" className="v-btn v-btn--quiet" onClick={() => setImporting(true)}><FileUp size={14} strokeWidth={1.8} />Import a CSV</button>}>
                                        {filtered ? 'Try another source, or everyone instead of just you.' : 'Add a lead by hand, or import a list. Calls and forms the agent qualifies land here too.'}
                                    </EmptyState>
                                </Panel>
                            ) : view === 'board' ? (
                                <Kanban
                                    columns={pipeline.stages}
                                    cards={leads.map((l) => ({ ...l, columnId: l.stage_id ?? '' }))}
                                    onMove={(id, stageId, position) => router.post(`/desk/leads/${id}/move`, { pipeline_stage_id: stageId, position }, { preserveScroll: true })}
                                    renderCard={(l) => <LeadCard lead={l} />}
                                    columnMeta={(_, cards) => compactMoney(cards.reduce((a, c) => a + c.value, 0))}
                                    onAdd={(col) => setAdding({ stageId: Number(col.id) })} addLabel="Add lead" emptyLabel="No leads"
                                />
                            ) : view === 'list' ? (
                                <GroupedList stages={pipeline.stages} leads={leads} onMove={moveTo} onAdd={(stageId) => setAdding({ stageId })} />
                            ) : (
                                <LeadTable stages={pipeline.stages} leads={leads} team={team} onMove={moveTo} />
                            )}
                        </section>
                    </>
                )}
            </DeskPage>

            {pipeline && <AddLeadDialog open={adding !== null} stageId={adding?.stageId} onClose={() => setAdding(null)} pipeline={pipeline} sources={sources} team={team} />}
            {pipeline && <ImportDialog open={importing} onClose={() => setImporting(false)} pipelineId={pipeline.id} />}
        </>
    );
}

/** The pipeline at a glance: its value, how many, and how the value splits across stages. */
function Summary({ stages, leads, totals, overdue }: { stages: Stage[]; leads: Lead[]; totals: Props['totals']; overdue: number }) {
    const byStage = stages.map((s) => {
        const inStage = leads.filter((l) => l.stage_id === s.id);
        return { ...s, count: inStage.length, value: inStage.reduce((a, l) => a + l.value, 0) };
    });

    return (
        <Panel>
            <div className="grid gap-x-10 gap-y-6 px-7 py-6 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,auto))_minmax(240px,1fr)] lg:items-end">
                <Figure label="Pipeline value" value={money(totals.value)} />
                <Figure label="Leads" value={totals.count} />
                <Figure label="Average" value={compactMoney(totals.count ? Math.round(totals.value / totals.count) : 0)} />
                <Figure label="Overdue follow-ups" value={overdue} tone={overdue > 0 ? 'var(--danger)' : undefined} />
                <div className="sm:col-span-2 lg:col-span-1 lg:pb-1.5">
                    <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken)' }} role="img"
                        aria-label={byStage.map((s) => `${s.name} ${money(s.value)}`).join(', ')}>
                        {byStage.filter((s) => (s.value || (totals.value === 0 ? s.count : 0)) > 0).map((s) => (
                            <div key={s.id} className="h-full" title={`${s.name}: ${money(s.value)}`}
                                style={{ flex: `${s.value || (totals.value === 0 ? s.count : 0)} 1 0`, background: s.color }} />
                        ))}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tertiary">
                        {byStage.map((s) => (
                            <span key={s.id} className="inline-flex items-center gap-1.5 tabular-nums">
                                <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />{s.name} {compactMoney(s.value)}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </Panel>
    );
}

function NextTouch({ at, overdue }: { at: string | null; overdue: boolean }) {
    if (!at) return <span className="text-sm text-tertiary">—</span>;

    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap" style={{ color: overdue ? 'var(--danger)' : 'var(--text-secondary)' }} title={new Date(at).toLocaleString()}>
            <CalendarClock size={13} strokeWidth={1.8} />
            {overdue ? 'Overdue · ' : ''}{new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
    );
}

const leadHref = (l: Lead) => (l.contact ? `/desk/contacts/${l.contact.id}` : undefined);

// ── board ────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
    const meta = [lead.contact?.company, humanize(lead.source)].filter(Boolean).join(' · ');
    const body = (
        <>
            <div className="flex items-start gap-3">
                <Avatar name={lead.contact?.name ?? '?'} initials={lead.contact?.initials ?? '?'} size={32} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-medium text-primary"><UserText>{lead.contact?.name ?? 'Unknown'}</UserText></div>
                    <div className="truncate text-xs text-tertiary">{meta}</div>
                </div>
            </div>
            {lead.outreach_note && <p className="mt-3 line-clamp-2 text-sm text-secondary"><UserText>{lead.outreach_note}</UserText></p>}
            <div className="mt-3.5 flex items-center gap-2">
                <span className="text-md font-semibold text-primary tabular-nums">{money(lead.value)}</span>
                {lead.next_response_at && <NextTouch at={lead.next_response_at} overdue={lead.overdue} />}
                <span className="flex-1" />
                <AvatarStack people={lead.assignees} size={24} />
            </div>
        </>
    );
    const href = leadHref(lead);
    return href
        ? <Link href={href} draggable={false} className="v-panel v-card-hover block px-4 py-3.5">{body}</Link>
        : <div className="v-panel block px-4 py-3.5">{body}</div>;
}

// ── list ─────────────────────────────────────────────────────────────────

function StageSelect({ lead, stages, onMove }: { lead: Lead; stages: Stage[]; onMove: (lead: Lead, stageId: number) => void }) {
    const stage = stages.find((s) => s.id === lead.stage_id);
    return (
        <StatusPill value={String(lead.stage_id ?? '')} color={stage?.color ?? 'var(--text-tertiary)'} label={`Stage for ${lead.contact?.name ?? 'lead'}`}
            options={stages.map((s) => ({ value: String(s.id), label: s.name }))} onChange={(v) => onMove(lead, Number(v))} />
    );
}

function GroupedList({ stages, leads, onMove, onAdd }: { stages: Stage[]; leads: Lead[]; onMove: (lead: Lead, stageId: number) => void; onAdd: (stageId: number) => void }) {
    const [folded, toggle] = useFolded('desk:leads:folded');

    return (
        <div className="flex flex-col gap-6">
            {stages.map((stage) => {
                const rows = leads.filter((l) => l.stage_id === stage.id);
                const key = String(stage.id);
                const open = !folded.has(key);
                return (
                    <Panel key={stage.id} className="overflow-hidden">
                        <GroupHeader open={open} onToggle={() => toggle(key)} color={stage.color} title={stage.name} count={rows.length}
                            meta={money(rows.reduce((a, l) => a + l.value, 0))}
                            action={<button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={() => onAdd(stage.id)}><Plus size={14} strokeWidth={2} />Add</button>} />
                        {open && (rows.length === 0 ? (
                            <p className="px-7 py-5 text-sm text-tertiary">Nobody is at this stage.</p>
                        ) : (
                            <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                                {rows.map((l) => {
                                    const href = leadHref(l);
                                    return (
                                        <div key={l.id} onClick={(e) => { if (href && !(e.target as HTMLElement).closest('a,button,select')) router.visit(href); }}
                                            className={`grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-6 transition-colors lg:grid-cols-[minmax(0,1fr)_120px_120px_140px_150px] ${href ? 'cursor-pointer hover:bg-surface-hover' : ''}`}>
                                            <div className="flex min-w-0 items-center gap-3">
                                                <Avatar name={l.contact?.name ?? '?'} initials={l.contact?.initials ?? '?'} size={32} />
                                                <div className="min-w-0">
                                                    {href
                                                        ? <Link href={href} className="block truncate text-base font-medium text-primary"><UserText>{l.contact?.name ?? 'Unknown'}</UserText></Link>
                                                        : <span className="block truncate text-base font-medium text-primary">Unknown</span>}
                                                    <span className="block truncate text-xs text-tertiary">{[l.contact?.company, humanize(l.source)].filter(Boolean).join(' · ')}</span>
                                                </div>
                                            </div>
                                            <div className="hidden text-right text-base font-semibold text-primary tabular-nums lg:block">{money(l.value)}</div>
                                            <div className="hidden lg:block"><NextTouch at={l.next_response_at} overdue={l.overdue} /></div>
                                            <div className="hidden lg:block">{l.assignees.length ? <AvatarStack people={l.assignees} size={24} /> : <span className="text-sm text-tertiary">Unassigned</span>}</div>
                                            <div className="flex justify-end"><StageSelect lead={l} stages={stages} onMove={onMove} /></div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </Panel>
                );
            })}
        </div>
    );
}

// ── table ────────────────────────────────────────────────────────────────

type LeadSort = 'name' | 'stage' | 'source' | 'value' | 'next' | 'updated';

function LeadTable({ stages, leads, team, onMove }: { stages: Stage[]; leads: Lead[]; team: Props['team']; onMove: (lead: Lead, stageId: number) => void }) {
    const [sort, setSort] = useState<{ key: LeadSort | null; dir: SortDir }>({ key: null, dir: 'asc' });
    const stageOrder = useMemo(() => new Map(stages.map((s, i) => [s.id, i])), [stages]);

    const rows = useMemo(() => {
        if (!sort.key) return leads;
        const value = (l: Lead): string | number => {
            switch (sort.key) {
                case 'name': return (l.contact?.name ?? '').toLowerCase();
                case 'stage': return stageOrder.get(l.stage_id ?? -1) ?? 999;
                case 'source': return l.source;
                case 'value': return l.value;
                case 'next': return l.next_response_at ? Date.parse(l.next_response_at) : Number.MAX_SAFE_INTEGER;
                default: return l.updated_at ? Date.parse(l.updated_at) : 0;
            }
        };
        const sign = sort.dir === 'asc' ? 1 : -1;
        return [...leads].sort((a, b) => { const x = value(a), y = value(b); return (x < y ? -1 : x > y ? 1 : 0) * sign; });
    }, [leads, sort, stageOrder]);

    const ids = useMemo(() => rows.map((l) => l.id), [rows]);
    const sel = useSelection(ids);
    const bulk = (data: Record<string, unknown>) =>
        router.post('/desk/leads/bulk', { ids: [...sel.selected], ...data }, { preserveScroll: true, onSuccess: () => sel.clear() });
    const head = { current: sort.key, dir: sort.dir, onSort: (key: string, dir: SortDir) => setSort({ key: key as LeadSort, dir }) };

    return (
        <div className="flex flex-col gap-5">
            <DataTable minWidth={900} head={
                <>
                    <HeadCell width={52}><Checkbox checked={sel.all} indeterminate={sel.some} onChange={sel.toggleAll} label="Select all leads" /></HeadCell>
                    <SortHead label="Lead" sortKey="name" {...head} />
                    <SortHead label="Stage" sortKey="stage" {...head} width={168} />
                    <SortHead label="Value" sortKey="value" {...head} align="right" width={112} />
                    <SortHead label="Source" sortKey="source" {...head} width={120} className="hidden 2xl:table-cell" />
                    <HeadCell width={150} className="hidden 2xl:table-cell">Phone</HeadCell>
                    <HeadCell width={112}>Assigned</HeadCell>
                    <SortHead label="Next touch" sortKey="next" {...head} width={150} />
                    <SortHead label="Updated" sortKey="updated" {...head} align="right" width={108} />
                </>
            }>
                {rows.map((l) => {
                    const href = leadHref(l);
                    return (
                        <TableRow key={l.id} selected={sel.has(l.id)} onOpen={href ? () => router.visit(href) : undefined}>
                            <Cell><Checkbox checked={sel.has(l.id)} onChange={(v) => sel.toggle(l.id, v)} label={`Select ${l.contact?.name ?? 'lead'}`} /></Cell>
                            <Cell className="w-full max-w-0">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Avatar name={l.contact?.name ?? '?'} initials={l.contact?.initials ?? '?'} size={30} />
                                    <div className="min-w-0 leading-tight">
                                        {href
                                            ? <Link href={href} className="block truncate text-base font-medium text-primary"><UserText>{l.contact?.name ?? 'Unknown'}</UserText></Link>
                                            : <span className="block truncate text-base font-medium text-primary">Unknown</span>}
                                        {l.contact?.company && <span className="block truncate text-xs text-tertiary">{l.contact.company}</span>}
                                    </div>
                                </div>
                            </Cell>
                            <Cell><StageSelect lead={l} stages={stages} onMove={onMove} /></Cell>
                            <Cell align="right"><span className="font-medium tabular-nums">{money(l.value)}</span></Cell>
                            <Cell className="hidden text-secondary 2xl:table-cell">{humanize(l.source)}</Cell>
                            <Cell className="hidden text-secondary tabular-nums whitespace-nowrap 2xl:table-cell">{l.contact?.phone ?? <span className="text-tertiary">—</span>}</Cell>
                            <Cell>{l.assignees.length ? <AvatarStack people={l.assignees} size={24} /> : <span className="text-tertiary">Unassigned</span>}</Cell>
                            <Cell><NextTouch at={l.next_response_at} overdue={l.overdue} /></Cell>
                            <Cell align="right"><RelativeTime at={l.updated_at} /></Cell>
                        </TableRow>
                    );
                })}
            </DataTable>
            <p className="px-1 text-sm text-tertiary tabular-nums">{leads.length.toLocaleString()} lead{leads.length === 1 ? '' : 's'}</p>

            <BulkBar count={sel.count} noun={['lead', 'leads']} onClear={sel.clear}>
                <BulkPick label="Move to" icon={<Workflow size={14} strokeWidth={1.9} />} onPick={(v) => bulk({ action: 'stage', pipeline_stage_id: Number(v) })}
                    options={stages.map((s) => ({ value: String(s.id), label: s.name, color: s.color }))} />
                <BulkAssign team={team} onApply={(ids) => bulk({ action: 'assign', assignee_ids: ids })} />
                <button type="button" className="v-btn v-btn--danger"
                    onClick={() => { if (window.confirm(`Remove ${sel.count} lead${sel.count === 1 ? '' : 's'} from the pipeline? The contacts are kept.`)) bulk({ action: 'delete' }); }}>
                    <Trash2 size={14} strokeWidth={1.9} />Remove
                </button>
            </BulkBar>
        </div>
    );
}

// ── dialogs ──────────────────────────────────────────────────────────────

function AddLeadDialog({ open, stageId, onClose, pipeline, sources, team }: { open: boolean; stageId?: number; onClose: () => void; pipeline: NonNullable<Props['pipeline']>; sources: string[]; team: Props['team'] }) {
    const first = pipeline.stages[0]?.id ?? '';
    const { data, setData, post, processing, errors, reset } = useForm({ name: '', phone: '', email: '', company: '', pipeline_id: pipeline.id, pipeline_stage_id: first as number | '', source: 'manual', value: 0, assignee_ids: [] as number[] });
    const err = (k: string) => (errors as Record<string, string>)[k];

    // Opening from a column or a group starts the lead in that stage.
    useEffect(() => { if (open) setData('pipeline_stage_id', stageId ?? first); }, [open, stageId]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/leads', { preserveScroll: true, onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="New lead" width={640} description={`Adds the person as a contact, if they are not one already, and places them in ${pipeline.name}.`}>
            <form onSubmit={submit} className="flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                    <div><label className="v-label" htmlFor="lead-name">Name</label><input id="lead-name" className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} dir="auto" autoFocus />{err('name') && <p className="mt-1.5 text-sm text-danger">{err('name')}</p>}</div>
                    <div><label className="v-label" htmlFor="lead-company">Company</label><input id="lead-company" className="v-field" value={data.company} onChange={(e) => setData('company', e.target.value)} /></div>
                    <div><label className="v-label" htmlFor="lead-phone">Phone</label><input id="lead-phone" className="v-field" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />{err('phone') && <p className="mt-1.5 text-sm text-danger">{err('phone')}</p>}</div>
                    <div><label className="v-label" htmlFor="lead-email">Email</label><input id="lead-email" className="v-field" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />{err('email') && <p className="mt-1.5 text-sm text-danger">{err('email')}</p>}</div>
                </div>
                <div className="grid gap-5 pt-5 sm:grid-cols-3" style={{ borderTop: '1px solid var(--separator)' }}>
                    <div><label className="v-label" htmlFor="lead-stage">Stage</label><select id="lead-stage" className="v-field" value={data.pipeline_stage_id} onChange={(e) => setData('pipeline_stage_id', Number(e.target.value))}>{pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                    <div><label className="v-label" htmlFor="lead-source">Source</label><select id="lead-source" className="v-field" value={data.source} onChange={(e) => setData('source', e.target.value)}>{sources.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></div>
                    <div><label className="v-label" htmlFor="lead-value">Value</label><input id="lead-value" className="v-field tabular-nums" type="number" min={0} value={data.value} onChange={(e) => setData('value', Number(e.target.value))} /></div>
                </div>
                <div>
                    <label className="v-label">Assign</label>
                    <AssigneePicker team={team} value={data.assignee_ids} onChange={(ids) => setData('assignee_ids', ids)} />
                </div>
                <div className="mt-1 flex justify-end gap-2 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Adding…' : 'Add lead'}</button>
                </div>
            </form>
        </Dialog>
    );
}

function ImportDialog({ open, onClose, pipelineId }: { open: boolean; onClose: () => void; pipelineId: number }) {
    const [headers, setHeaders] = useState<string[]>([]);
    const { data, setData, post, processing, errors, reset } = useForm<{ file: File | null; pipeline_id: number; mapping: Record<string, string> }>({ file: null, pipeline_id: pipelineId, mapping: {} });

    const pick = async (file: File) => {
        setData('file', file);
        const text = await file.slice(0, 4096).text();
        const cols = (text.split(/\r?\n/)[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        setHeaders(cols);
        // Guess the mapping from the header names, so the common case is one click.
        const guess = (keys: string[]) => cols.find((c) => keys.some((k) => c.toLowerCase().includes(k))) ?? '';
        setData('mapping', { name: guess(['name']), phone: guess(['phone', 'mobile', 'tel']), email: guess(['email']), company: guess(['company', 'org']), value: guess(['value', 'amount', 'budget']) });
    };
    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/leads/import', { forceFormData: true, preserveScroll: true, onSuccess: () => { reset(); setHeaders([]); onClose(); } }); };
    const fileError = (errors as Record<string, string>).file;

    return (
        <Dialog open={open} onClose={onClose} title="Import leads from CSV" width={620} description="Rows are matched to existing contacts by phone or email, so re-importing does not duplicate.">
            <form onSubmit={submit} className="flex flex-col gap-5">
                <label className="flex cursor-pointer items-center gap-4 rounded-[var(--radius-lg)] px-5 py-5 transition-colors hover:bg-surface-hover" style={{ border: '1.5px dashed var(--border-strong)' }}>
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] text-secondary" style={{ background: 'var(--surface-sunken)' }}><FileUp size={18} strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium text-primary">{data.file ? data.file.name : 'Choose a CSV file'}</span>
                        <span className="block text-sm text-tertiary">{data.file ? `${headers.length} columns found` : 'The first row should be the column names. Up to 5 MB.'}</span>
                    </span>
                    <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} className="sr-only" />
                </label>
                {fileError && <p className="-mt-2 text-sm text-danger">{fileError}</p>}
                {headers.length > 0 && (
                    <div>
                        <div className="mb-3 text-base font-medium text-primary">Match the columns</div>
                        <div className="grid gap-5 sm:grid-cols-2">
                            {(['name', 'phone', 'email', 'company', 'value'] as const).map((field) => (
                                <div key={field}>
                                    <label className="v-label" htmlFor={`map-${field}`}>{humanize(field)}</label>
                                    <select id={`map-${field}`} className="v-field" value={data.mapping[field] ?? ''} onChange={(e) => setData('mapping', { ...data.mapping, [field]: e.target.value })}>
                                        <option value="">Skip</option>
                                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="mt-1 flex justify-end gap-2 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.file}>{processing ? 'Importing…' : 'Import'}</button>
                </div>
            </form>
        </Dialog>
    );
}
