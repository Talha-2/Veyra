import { Head, Link, router, useForm } from '@inertiajs/react';
import { CalendarClock, FileUp, KanbanSquare, List as ListIcon, Plus, Target, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import AssigneePicker from '../../components/ui/assignee-picker';
import Dialog from '../../components/ui/dialog';
import Kanban from '../../components/desk/kanban';
import { AvatarStack, SplitBar, ViewSwitch } from '../../components/desk-pages/bits';
import { compactMoney, humanize, money } from '../../components/desk-pages/format';
import { Card, SearchField, SegmentedControl, Toolbar } from '../../components/ui/kit';
import { PageHeader, Row, Table, Td, Th } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, RelativeTime, UserText } from '../../components/ui/primitives';

interface Lead {
    id: number; contact: { id: number; name: string; initials: string; company: string | null; phone: string | null } | null;
    stage_id: number | null; source: string; value: number; position: number; next_response_at: string | null; overdue: boolean;
    outreach_note: string | null; assignees: { id: number; name: string }[]; updated_at: string | null;
}
interface Props {
    view: 'kanban' | 'list';
    pipeline: { id: number; name: string; stages: { id: number; name: string; color: string }[] } | null;
    pipelines: { id: number; name: string }[];
    leads: Lead[];
    filters: { search: string | null; source: string | null; mine: boolean };
    sources: string[];
    team: { id: number; name: string }[];
    totals: { count: number; value: number };
}

/** Z360 calls these Inquiries. Kanban by stage, drag to move, plus list and CSV import. */
export default function Leads({ view, pipeline, pipelines, leads, filters, sources, team, totals }: Props) {
    const [adding, setAdding] = useState(false);
    const [importing, setImporting] = useState(false);
    const [term, setTerm] = useState(filters.search ?? '');

    const q = (patch: Record<string, string | undefined>) =>
        router.get('/desk/leads', { view, pipeline: pipeline?.id, search: filters.search || undefined, source: filters.source || undefined, mine: filters.mine ? '1' : undefined, ...patch }, { preserveState: true, preserveScroll: true, replace: true });

    useEffect(() => {
        if ((filters.search ?? '') === term) return;
        const t = setTimeout(() => q({ search: term || undefined }), 300);
        return () => clearTimeout(t);
    }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

    const overdue = leads.filter((l) => l.overdue).length;
    const filtered = !!(filters.search || filters.source || filters.mine);

    return (
        <>
            <Head title="Leads" />
            <div className="mx-auto max-w-[1320px] px-6 py-7 md:px-8">
                <PageHeader
                    title="Leads"
                    description={pipeline ? `People moving through ${pipeline.name}. Drag a card to change its stage.` : 'People moving through a pipeline.'}
                    actions={
                        <>
                            <button type="button" className="v-btn v-btn--quiet" onClick={() => setImporting(true)} disabled={!pipeline}><Upload size={14} strokeWidth={1.8} />Import CSV</button>
                            <button type="button" className="v-btn v-btn--primary" onClick={() => setAdding(true)} disabled={!pipeline}><Plus size={14} strokeWidth={2} />New lead</button>
                        </>
                    }
                />

                <Toolbar trailing={
                    <>
                        <SearchField value={term} onChange={setTerm} placeholder="Search leads" className="w-full sm:w-[240px]" />
                        <ViewSwitch current={view} options={[
                            { key: 'kanban', label: 'Board', icon: <KanbanSquare size={15} strokeWidth={1.8} />, href: `/desk/leads?view=kanban&pipeline=${pipeline?.id ?? ''}` },
                            { key: 'list', label: 'List', icon: <ListIcon size={15} strokeWidth={1.8} />, href: `/desk/leads?view=list&pipeline=${pipeline?.id ?? ''}` },
                        ]} />
                    </>
                }>
                    {pipelines.length > 1 && (
                        <select className="v-field h-[34px] w-auto rounded-full pr-9 pl-3.5 font-medium" aria-label="Pipeline" value={pipeline?.id ?? ''} onChange={(e) => q({ pipeline: e.target.value })}>
                            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    )}
                    <SegmentedControl<'all' | 'mine'> value={filters.mine ? 'mine' : 'all'} onChange={(v) => q({ mine: v === 'mine' ? '1' : undefined })}
                        options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'Assigned to me' }]} />
                    <select className="v-field h-[34px] w-auto rounded-full pr-9 pl-3.5" aria-label="Source" value={filters.source ?? ''} onChange={(e) => q({ source: e.target.value || undefined })}>
                        <option value="">All sources</option>
                        {sources.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                    </select>
                </Toolbar>

                {!pipeline ? (
                    <Card><EmptyState icon={<KanbanSquare size={20} strokeWidth={1.8} />} title="No pipeline yet">A pipeline is the set of stages a lead moves through. Create one in Studio settings, then leads can move through it here.</EmptyState></Card>
                ) : (
                    <>
                        <BoardHeader stages={pipeline.stages} leads={leads} totals={totals} overdue={overdue} />

                        {leads.length === 0 && (view === 'list' || filtered) ? (
                            <Card>
                                <EmptyState icon={<Target size={20} strokeWidth={1.8} />} title={filtered ? 'No leads match' : 'No leads in this pipeline'}
                                    action={filtered ? <Link href={`/desk/leads?view=${view}&pipeline=${pipeline.id}`} className="v-btn v-btn--quiet">Clear filters</Link> : <button type="button" className="v-btn v-btn--quiet" onClick={() => setImporting(true)}><FileUp size={14} strokeWidth={1.8} />Import a CSV</button>}>
                                    {filtered ? 'Try another source, or everyone instead of just you.' : 'Add a lead by hand, or import a list. Calls and forms the agent qualifies land here too.'}
                                </EmptyState>
                            </Card>
                        ) : view === 'kanban' ? (
                            <Kanban
                                columns={pipeline.stages}
                                cards={leads.map((l) => ({ ...l, columnId: l.stage_id ?? '' }))}
                                onMove={(id, stageId, position) => router.post(`/desk/leads/${id}/move`, { pipeline_stage_id: stageId, position }, { preserveScroll: true })}
                                renderCard={(l) => <LeadCard lead={l} />}
                                columnFooter={(_, cards) => (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-tertiary">{cards.length} lead{cards.length === 1 ? '' : 's'}</span>
                                        <span className="font-semibold text-primary tabular-nums">{money(cards.reduce((a, c) => a + c.value, 0))}</span>
                                    </div>
                                )}
                            />
                        ) : (
                            <Table head={<><Th>Lead</Th><Th>Stage</Th><Th>Source</Th><Th align="right">Value</Th><Th>Assigned</Th><Th>Next touch</Th><Th align="right">Updated</Th></>}>
                                {leads.map((l) => {
                                    const stage = pipeline.stages.find((s) => s.id === l.stage_id);
                                    return (
                                        <Row key={l.id} href={l.contact ? `/desk/contacts/${l.contact.id}` : undefined}>
                                            <Td>
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={l.contact?.name ?? '?'} initials={l.contact?.initials ?? '?'} size={30} />
                                                    <div className="min-w-0">
                                                        <div className="max-w-[240px] truncate text-base font-medium text-primary"><UserText>{l.contact?.name ?? '—'}</UserText></div>
                                                        <div className="max-w-[240px] truncate text-xs text-tertiary">{l.contact?.company ?? l.contact?.phone ?? 'No company'}</div>
                                                    </div>
                                                </div>
                                            </Td>
                                            <Td>{stage ? <span className="inline-flex items-center gap-2 text-sm text-primary"><span className="size-2 rounded-full" style={{ background: stage.color }} aria-hidden="true" />{stage.name}</span> : <span className="text-tertiary">—</span>}</Td>
                                            <Td muted>{humanize(l.source)}</Td>
                                            <Td align="right"><span className="font-medium tabular-nums">{money(l.value)}</span></Td>
                                            <Td>{l.assignees.length ? <AvatarStack people={l.assignees} /> : <span className="text-sm text-tertiary">Unassigned</span>}</Td>
                                            <Td><NextTouch at={l.next_response_at} overdue={l.overdue} /></Td>
                                            <Td align="right"><RelativeTime at={l.updated_at} /></Td>
                                        </Row>
                                    );
                                })}
                            </Table>
                        )}
                    </>
                )}
            </div>

            {pipeline && <AddLeadDialog open={adding} onClose={() => setAdding(false)} pipeline={pipeline} sources={sources} team={team} />}
            {pipeline && <ImportDialog open={importing} onClose={() => setImporting(false)} pipelineId={pipeline.id} />}
        </>
    );
}

/**
 * The board's header: how the pipeline's value splits across its stages, and
 * each stage's count and sum. Stage colours come from the pipeline's own data.
 */
function BoardHeader({ stages, leads, totals, overdue }: { stages: NonNullable<Props['pipeline']>['stages']; leads: Lead[]; totals: Props['totals']; overdue: number }) {
    const byStage = stages.map((s) => {
        const inStage = leads.filter((l) => l.stage_id === s.id);
        return { ...s, count: inStage.length, value: inStage.reduce((a, l) => a + l.value, 0) };
    });

    return (
        <Card className="mb-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 px-5 pt-4 pb-3.5">
                <div>
                    <div className="text-xs text-tertiary">Pipeline value</div>
                    <div className="text-2xl font-semibold tracking-tight tabular-nums text-primary">{money(totals.value)}</div>
                </div>
                <div>
                    <div className="text-xs text-tertiary">Leads</div>
                    <div className="text-2xl font-semibold tracking-tight tabular-nums text-primary">{totals.count}</div>
                </div>
                <div>
                    <div className="text-xs text-tertiary">Average</div>
                    <div className="text-2xl font-semibold tracking-tight tabular-nums text-primary">{compactMoney(totals.count ? Math.round(totals.value / totals.count) : 0)}</div>
                </div>
                <div>
                    <div className="text-xs text-tertiary">Overdue follow-ups</div>
                    <div className="text-2xl font-semibold tracking-tight tabular-nums" style={{ color: overdue > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{overdue}</div>
                </div>
                <div className="min-w-[200px] flex-1 pb-2">
                    <SplitBar height={8} parts={byStage.map((s) => ({ value: s.value || (totals.value === 0 ? s.count : 0), color: s.color, label: s.name }))} />
                </div>
            </div>
            <div className="grid overflow-x-auto" style={{ gridTemplateColumns: `repeat(${Math.max(1, byStage.length)}, minmax(140px, 1fr))`, borderTop: '1px solid var(--separator)' }}>
                {byStage.map((s) => (
                    <div key={s.id} className="min-w-0 px-5 py-3 not-first:border-l" style={{ borderColor: 'var(--separator)' }}>
                        <div className="flex items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                            <span className="truncate text-sm font-medium text-primary">{s.name}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                            <span className="text-md font-semibold tabular-nums text-primary">{compactMoney(s.value)}</span>
                            <span className="text-xs text-tertiary tabular-nums">{s.count}</span>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function NextTouch({ at, overdue }: { at: string | null; overdue: boolean }) {
    if (!at) return <span className="text-sm text-tertiary">—</span>;

    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: overdue ? 'var(--danger)' : 'var(--text-secondary)' }} title={new Date(at).toLocaleString()}>
            <CalendarClock size={13} strokeWidth={1.8} />
            {overdue ? 'Overdue · ' : ''}{new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
    );
}

function LeadCard({ lead }: { lead: Lead }) {
    const hasFooter = lead.next_response_at || lead.assignees.length > 0;

    return (
        <Link href={lead.contact ? `/desk/contacts/${lead.contact.id}` : '#'} className="v-panel v-card-hover block p-3.5">
            <div className="flex items-start gap-2.5">
                <Avatar name={lead.contact?.name ?? '?'} initials={lead.contact?.initials ?? '?'} size={28} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-primary"><UserText>{lead.contact?.name ?? '—'}</UserText></div>
                    <div className="truncate text-xs text-tertiary">{lead.contact?.company ?? lead.contact?.phone ?? 'No company'}</div>
                </div>
            </div>

            {lead.outreach_note && <p className="mt-2.5 line-clamp-2 text-xs text-secondary"><UserText>{lead.outreach_note}</UserText></p>}

            <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-md font-semibold tabular-nums text-primary">{money(lead.value)}</span>
                <Badge tone="muted">{humanize(lead.source)}</Badge>
            </div>

            {hasFooter && (
                <div className="mt-3 flex items-center justify-between gap-2 pt-2.5" style={{ borderTop: '1px solid var(--separator)' }}>
                    <NextTouch at={lead.next_response_at} overdue={lead.overdue} />
                    <AvatarStack people={lead.assignees} size={20} />
                </div>
            )}
        </Link>
    );
}

function AddLeadDialog({ open, onClose, pipeline, sources, team }: { open: boolean; onClose: () => void; pipeline: NonNullable<Props['pipeline']>; sources: string[]; team: Props['team'] }) {
    const { data, setData, post, processing, errors, reset } = useForm({ name: '', phone: '', email: '', company: '', pipeline_id: pipeline.id, pipeline_stage_id: pipeline.stages[0]?.id ?? '', source: 'manual', value: 0, assignee_ids: [] as number[] });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/leads', { preserveScroll: true, onSuccess: () => { reset(); onClose(); } }); };
    const err = (k: string) => (errors as Record<string, string>)[k];

    return (
        <Dialog open={open} onClose={onClose} title="New lead" description={`Adds the person as a contact, if they are not one already, and places them in ${pipeline.name}.`} width={560}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div><label className="v-label" htmlFor="lead-name">Name</label><input id="lead-name" className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} dir="auto" autoFocus />{err('name') && <p className="mt-1.5 text-sm text-danger">{err('name')}</p>}</div>
                    <div><label className="v-label" htmlFor="lead-company">Company</label><input id="lead-company" className="v-field" value={data.company} onChange={(e) => setData('company', e.target.value)} /></div>
                    <div><label className="v-label" htmlFor="lead-phone">Phone</label><input id="lead-phone" className="v-field" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />{err('phone') && <p className="mt-1.5 text-sm text-danger">{err('phone')}</p>}</div>
                    <div><label className="v-label" htmlFor="lead-email">Email</label><input id="lead-email" className="v-field" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />{err('email') && <p className="mt-1.5 text-sm text-danger">{err('email')}</p>}</div>
                    <div><label className="v-label" htmlFor="lead-stage">Stage</label><select id="lead-stage" className="v-field" value={data.pipeline_stage_id} onChange={(e) => setData('pipeline_stage_id', Number(e.target.value))}>{pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                    <div><label className="v-label" htmlFor="lead-source">Source</label><select id="lead-source" className="v-field" value={data.source} onChange={(e) => setData('source', e.target.value)}>{sources.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></div>
                    <div><label className="v-label" htmlFor="lead-value">Value</label><input id="lead-value" className="v-field tabular-nums" type="number" min={0} value={data.value} onChange={(e) => setData('value', Number(e.target.value))} /></div>
                </div>
                <div>
                    <label className="v-label">Assign</label>
                    <AssigneePicker team={team} value={data.assignee_ids} onChange={(ids) => setData('assignee_ids', ids)} />
                </div>
                <div className="flex justify-end gap-2"><button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button><button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Adding…' : 'Add lead'}</button></div>
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
        <Dialog open={open} onClose={onClose} title="Import leads from CSV" description="Rows are matched to existing contacts by phone or email, so re-importing does not duplicate.">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-4 py-3.5 transition-colors hover:bg-surface-hover" style={{ border: '1px dashed var(--border-strong)' }}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-secondary" style={{ background: 'var(--surface-sunken)' }}><FileUp size={16} strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-primary">{data.file ? data.file.name : 'Choose a CSV file'}</span>
                        <span className="block text-xs text-tertiary">{data.file ? `${headers.length} columns found` : 'The first row should be the column names. Up to 5 MB.'}</span>
                    </span>
                    <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} className="sr-only" />
                </label>
                {fileError && <p className="-mt-2 text-sm text-danger">{fileError}</p>}
                {headers.length > 0 && (
                    <div>
                        <div className="mb-2 text-sm font-medium text-primary">Match the columns</div>
                        <div className="grid gap-3 md:grid-cols-2">
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
                <div className="flex justify-end gap-2"><button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button><button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.file}>{processing ? 'Importing…' : 'Import'}</button></div>
            </form>
        </Dialog>
    );
}
