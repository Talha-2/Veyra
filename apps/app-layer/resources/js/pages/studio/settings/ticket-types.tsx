import { router, useForm } from '@inertiajs/react';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { SwatchInput } from '../../../components/studio-ops/color-swatch';
import { Field } from '../../../components/studio/form';
import SettingsShell from '../../../components/studio/settings-shell';
import AssigneePicker from '../../../components/ui/assignee-picker';
import Dialog from '../../../components/ui/dialog';
import { Card, CardHeader, Switch } from '../../../components/ui/kit';
import { Avatar, Badge, EmptyState } from '../../../components/ui/primitives';

interface Type { id: number; name: string; color: string; description: string | null; default_assignee_ids: number[]; enabled: boolean; tickets_count: number }
type Member = { id: number; name: string };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

/** The type's own colour as a tile: the swatch people learn to recognise in Desk. */
function TypeTile({ color, size = 36 }: { color: string; size?: number }) {
    return (
        <span className="flex shrink-0 items-center justify-center rounded-[10px]" style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 18%, var(--surface))`, color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)` }} aria-hidden="true">
            <Tag size={16} strokeWidth={2} />
        </span>
    );
}

export default function TicketTypeSettings({ types, team }: { types: Type[]; team: Member[] }) {
    const [editing, setEditing] = useState<Type | 'new' | null>(null);
    const active = types.filter((t) => t.enabled).length;

    return (
        <SettingsShell
            title="Ticket types"
            description="Types route tickets. Each carries default assignees, and the agent uses them too: a Billing ticket it raises lands with billing without triage."
            meta={types.length > 0 ? <Badge>{active} of {types.length} in use</Badge> : undefined}
            actions={<button type="button" className="v-btn v-btn--primary" onClick={() => setEditing('new')}><Plus size={15} strokeWidth={2} />New type</button>}
        >
            <Card>
                {types.length === 0 ? (
                    <EmptyState icon={<Tag size={20} strokeWidth={1.8} />} title="No ticket types yet">
                        Tickets work without them. Add a type such as Billing or Repair to route new tickets to the right people automatically.
                    </EmptyState>
                ) : (
                    <>
                        <CardHeader title="Types" description="Turning a type off hides it when creating tickets. Existing tickets keep it." />
                        <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                            {types.map((t) => {
                                const assignees = t.default_assignee_ids.map((id) => team.find((u) => u.id === id)).filter((u): u is Member => !!u);
                                return (
                                    <div key={t.id} className="flex items-center gap-3.5 px-5 py-3.5">
                                        <div className={`flex min-w-0 flex-1 items-center gap-3.5 transition-opacity ${t.enabled ? '' : 'opacity-55'}`}>
                                            <TypeTile color={t.color} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-base font-medium text-primary">{t.name}</span>
                                                    {!t.enabled && <Badge>Off</Badge>}
                                                </div>
                                                <div className="truncate text-sm text-secondary">{t.description || 'No description'}</div>
                                            </div>
                                            <div className="hidden w-36 shrink-0 items-center gap-2 sm:flex" title={assignees.map((a) => a.name).join(', ')}>
                                                {assignees.length > 0 ? (
                                                    <>
                                                        <span className="flex -space-x-1.5">
                                                            {assignees.slice(0, 3).map((a) => <span key={a.id} className="rounded-full" style={{ boxShadow: '0 0 0 2px var(--surface)' }}><Avatar initials={initials(a.name)} name={a.name} size={22} /></span>)}
                                                        </span>
                                                        <span className="truncate text-xs text-secondary">{assignees.length === 1 ? assignees[0].name.split(' ')[0] : `${assignees.length} people`}</span>
                                                    </>
                                                ) : <span className="text-xs text-tertiary">No default assignee</span>}
                                            </div>
                                            <span className="hidden w-20 shrink-0 text-right text-sm text-secondary tabular-nums md:inline">{t.tickets_count} {t.tickets_count === 1 ? 'ticket' : 'tickets'}</span>
                                        </div>
                                        <Switch size="sm" checked={t.enabled} label={`${t.name} in use`} onChange={(v) => router.patch(`/studio/settings/ticket-types/${t.id}`, { enabled: v }, { preserveScroll: true })} />
                                        <button type="button" className="v-btn v-btn--ghost v-btn--icon" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil size={14} strokeWidth={2} /></button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </Card>
            {editing && <TypeDialog type={editing === 'new' ? null : editing} team={team} onClose={() => setEditing(null)} />}
        </SettingsShell>
    );
}

function TypeDialog({ type, team, onClose }: { type: Type | null; team: Member[]; onClose: () => void }) {
    const { data, setData, post, patch, processing, errors } = useForm({ name: type?.name ?? '', color: type?.color ?? '#4dcafa', description: type?.description ?? '', default_assignee_ids: type?.default_assignee_ids ?? [] });
    const submit = (e: FormEvent) => { e.preventDefault(); type ? patch(`/studio/settings/ticket-types/${type.id}`, { onSuccess: onClose }) : post('/studio/settings/ticket-types', { onSuccess: onClose }); };
    const deletable = type && type.tickets_count === 0;

    return (
        <Dialog open onClose={onClose} title={type ? `Edit ${type.name}` : 'New ticket type'} description="The colour marks the type everywhere a ticket appears in Desk.">
            <form onSubmit={submit}>
                <div className="mb-5 flex items-center gap-3 rounded-md px-3.5 py-3" style={{ background: 'var(--surface-sunken)' }}>
                    <TypeTile color={data.color} size={32} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-primary">{data.name.trim() || 'Untitled type'}</div>
                        <div className="truncate text-xs text-secondary">{data.description.trim() || 'Preview of how it appears in lists'}</div>
                    </div>
                </div>
                <Field label="Name" error={errors.name}>
                    <input className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Billing" autoFocus />
                </Field>
                <Field label="Colour" error={errors.color}>
                    <SwatchInput value={data.color} onChange={(c) => setData('color', c)} label="Type colour" withHex size={34} />
                </Field>
                <Field label="Description" hint="One line saying what belongs here. People pick a type from this." error={errors.description}>
                    <input className="v-field" value={data.description} onChange={(e) => setData('description', e.target.value)} placeholder="Invoices, refunds and payment questions" />
                </Field>
                <Field label="Default assignees" hint="New tickets of this type, including ones the agent raises, go to these people.">
                    <AssigneePicker team={team} value={data.default_assignee_ids} onChange={(ids) => setData('default_assignee_ids', ids)} />
                </Field>
                <div className="mt-6 flex items-center gap-2">
                    {deletable && (
                        <button type="button" className="v-btn v-btn--danger" onClick={() => confirm(`Delete "${type.name}"? This cannot be undone.`) && router.delete(`/studio/settings/ticket-types/${type.id}`, { onSuccess: onClose })}>
                            <Trash2 size={14} strokeWidth={2} />Delete
                        </button>
                    )}
                    {type && !deletable && <span className="text-xs text-tertiary">In use by {type.tickets_count} tickets, so it can be turned off but not deleted.</span>}
                    <div className="flex-1" />
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.name.trim()}>{processing ? 'Saving…' : type ? 'Save' : 'Create type'}</button>
                </div>
            </form>
        </Dialog>
    );
}
