import { router, useForm, usePage } from '@inertiajs/react';
import { Check, Copy, Mail, UserMinus, UserPlus } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { RowMenu } from '../../../components/studio-ops/row-menu';
import { Field } from '../../../components/studio/form';
import SettingsShell from '../../../components/studio/settings-shell';
import { MenuItem, MenuSeparator } from '../../../components/shell/menu';
import Dialog from '../../../components/ui/dialog';
import { DialogActions, PanelHeader } from '../../../components/studio-ops/page-parts';
import { Callout, Card, CopyButton, IconTile, List } from '../../../components/ui/kit';
import { Avatar, Badge, EmptyState, RelativeTime } from '../../../components/ui/primitives';
import { toast } from '../../../components/ui/toaster';
import type { SharedProps } from '../../../types';

interface Member { id: number; user_id: number; name: string; email: string; role: string; role_label: string; surfaces: string[]; extension: string | null; phone: string | null; joined_at: string | null }
interface Props {
    members: Member[];
    invitations: { id: number; email: string; role: string; surfaces: string[]; invited_by: string | null; expires_at: string; link: string }[];
    roles: { value: string; label: string; default_surfaces: string[] }[];
    surface_options: { value: string; label: string; tagline: string }[];
    can_manage: boolean; me: number;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
/** "Veyra Desk" reads as "Desk" inside a row that is already about Veyra. */
const short = (label: string) => label.replace(/^Veyra\s+/, '');
const COLS = 'md:grid-cols-[minmax(0,1fr)_144px_168px_96px_36px]';

/**
 * Who is on the team and what each person can open.
 *
 * Surface access is per membership, not per role — the thing the seed data
 * proves with an admin who has Studio but not Desk. This page is where that
 * gets set.
 */
export default function TeamSettings({ members, invitations, roles, surface_options: surfaces, can_manage, me }: Props) {
    const [inviting, setInviting] = useState(false);
    const errors = (usePage<SharedProps>().props.errors ?? {}) as Record<string, string>;
    const update = (m: Member, patch: { role?: string; surfaces?: string[]; extension?: string | null; phone?: string | null }) => router.patch(`/studio/settings/team/${m.id}`, patch, { preserveScroll: true });
    const surfaceLabel = (v: string) => short(surfaces.find((s) => s.value === v)?.label ?? v);

    return (
        <SettingsShell
            title="Team & access"
            description="Who can sign in, what they can change, and which of Desk and Studio each person opens."
            meta={<><Badge>{members.length} {members.length === 1 ? 'member' : 'members'}</Badge>{invitations.length > 0 && <Badge tone="info" dot>{invitations.length} pending</Badge>}</>}
            actions={can_manage ? <button type="button" className="v-btn v-btn--primary" onClick={() => setInviting(true)}><UserPlus size={15} strokeWidth={2} />Invite</button> : undefined}
        >
            {!can_manage && (
                <div className="mb-6"><Callout tone="info">Only owners and admins can change roles, access or extensions. Ask one of them if something here is wrong.</Callout></div>
            )}
            {(errors.role || errors.surfaces) && (
                <div className="mb-6"><Callout tone="danger" title="That change was not saved">{errors.role ?? errors.surfaces}</Callout></div>
            )}

            <Card className="mb-6">
                <PanelHeader title="Members" description="Desk and Studio are granted separately. A support agent can have Desk and never see Studio; an admin can have Studio without Desk." />
                <div className={`hidden h-11 items-center gap-5 px-7 text-xs font-medium text-tertiary md:grid ${COLS}`} style={{ borderBottom: '1px solid var(--separator)' }}>
                    <span>Member</span><span>Role</span><span>Can open</span><span>Extension</span><span className="sr-only">Actions</span>
                </div>
                <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                    {members.map((m) => (
                        <MemberRow key={m.id} member={m} isMe={m.user_id === me} canManage={can_manage} roles={roles} surfaces={surfaces} surfaceLabel={surfaceLabel} update={update} />
                    ))}
                </div>
            </Card>

            <Card>
                <PanelHeader
                    title="Pending invitations"
                    description="Each invitation is a link that expires seven days after it was created. Share it with the person it is for."
                />
                {invitations.length === 0 ? (
                    <EmptyState icon={<Mail size={20} strokeWidth={1.8} />} title="No one is waiting to join" action={can_manage ? <button type="button" className="v-btn v-btn--quiet" onClick={() => setInviting(true)}><UserPlus size={14} strokeWidth={2} />Invite someone</button> : undefined}>
                        Invite a teammate by email and choose what they can open before they arrive.
                    </EmptyState>
                ) : (
                    <List>
                        {invitations.map((i) => (
                            <div key={i.id} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-7 py-3">
                                <IconTile tone="info" size={36}><Mail size={16} strokeWidth={1.9} /></IconTile>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-base font-medium text-primary">{i.email}</div>
                                    <div className="truncate text-sm text-secondary">{i.role} · {i.surfaces.map(surfaceLabel).join(' + ')}{i.invited_by && <> · invited by {i.invited_by}</>}</div>
                                </div>
                                <span className="hidden text-sm text-tertiary sm:inline">Expires <RelativeTime at={i.expires_at} className="text-sm" /></span>
                                <CopyButton value={i.link} label="Copy link" />
                                {can_manage && (
                                    <RowMenu label={`More for ${i.email}`}>
                                        {(close) => (
                                            <MenuItem danger icon={<UserMinus size={14} strokeWidth={2} />} onSelect={() => { close(); if (confirm(`Revoke the invitation for ${i.email}? The link stops working.`)) router.delete(`/studio/settings/team/invitations/${i.id}`, { preserveScroll: true }); }}>
                                                Revoke invitation
                                            </MenuItem>
                                        )}
                                    </RowMenu>
                                )}
                            </div>
                        ))}
                    </List>
                )}
            </Card>

            <InviteDialog open={inviting} onClose={() => setInviting(false)} roles={roles} surfaces={surfaces} />
        </SettingsShell>
    );
}

function MemberRow({ member: m, isMe, canManage, roles, surfaces, surfaceLabel, update }: {
    member: Member; isMe: boolean; canManage: boolean; roles: Props['roles']; surfaces: Props['surface_options'];
    surfaceLabel: (v: string) => string;
    update: (m: Member, patch: { role?: string; surfaces?: string[]; extension?: string | null }) => void;
}) {
    const saveExtension = (value: string) => { if (value !== (m.extension ?? '')) update(m, { extension: value || null }); };

    return (
        <div className={`grid min-h-16 items-center gap-x-5 gap-y-3 px-7 py-3 transition-colors hover:bg-surface-hover ${COLS}`}>
            <div className="flex min-w-0 items-center gap-3">
                <Avatar initials={initials(m.name)} name={m.email} size={36} />
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-base font-medium text-primary">{m.name}</span>
                        {isMe && <Badge tone="accent">You</Badge>}
                    </div>
                    <div className="truncate text-sm text-secondary">{m.email}</div>
                </div>
            </div>

            <div>
                {canManage ? (
                    <select className="v-field h-9 text-sm" value={m.role} onChange={(e) => update(m, { role: e.target.value })} aria-label={`Role for ${m.name}`}>
                        {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                ) : <Badge>{m.role_label}</Badge>}
            </div>

            <div className="flex flex-wrap gap-1.5">
                {surfaces.map((s) => {
                    const on = m.surfaces.includes(s.value);
                    // The server needs at least one; say so rather than bounce the request.
                    const last = on && m.surfaces.length === 1;
                    if (!canManage) return on ? <Badge key={s.value} tone="accent">{surfaceLabel(s.value)}</Badge> : null;
                    return (
                        <button
                            key={s.value}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={`${s.label} for ${m.name}`}
                            disabled={last}
                            title={last ? 'Everyone needs at least one surface.' : `${s.label}: ${s.tagline}`}
                            onClick={() => update(m, { surfaces: on ? m.surfaces.filter((x) => x !== s.value) : [...m.surfaces, s.value] })}
                            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                            style={on
                                ? { background: 'var(--accent-subtle)', color: 'var(--accent-text)', boxShadow: 'inset 0 0 0 1px var(--border-accent)' }
                                : { background: 'transparent', color: 'var(--text-tertiary)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}
                        >
                            {on && <Check size={12} strokeWidth={2.4} />}
                            {surfaceLabel(s.value)}
                        </button>
                    );
                })}
            </div>

            <div>
                {canManage ? (
                    <input
                        className="v-field h-9 text-sm tabular-nums"
                        placeholder="None"
                        inputMode="numeric"
                        defaultValue={m.extension ?? ''}
                        onBlur={(e) => saveExtension(e.target.value.trim())}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        aria-label={`Extension for ${m.name}`}
                    />
                ) : <span className="text-sm text-secondary tabular-nums">{m.extension ?? 'None'}</span>}
            </div>

            <div className="flex justify-end">
                <RowMenu label={`More for ${m.name}`}>
                    {(close) => (
                        <>
                            <MenuItem icon={<Copy size={14} strokeWidth={2} />} onSelect={() => { close(); navigator.clipboard?.writeText(m.email); toast('Email copied.'); }}>Copy email</MenuItem>
                            {canManage && !isMe && (
                                <>
                                    <MenuSeparator />
                                    <MenuItem danger icon={<UserMinus size={14} strokeWidth={2} />} onSelect={() => { close(); if (confirm(`Remove ${m.name} from the team? They lose access to Desk and Studio immediately.`)) router.delete(`/studio/settings/team/${m.id}`, { preserveScroll: true }); }}>
                                        Remove from team
                                    </MenuItem>
                                </>
                            )}
                        </>
                    )}
                </RowMenu>
            </div>
        </div>
    );
}

function InviteDialog({ open, onClose, roles, surfaces }: { open: boolean; onClose: () => void; roles: Props['roles']; surfaces: Props['surface_options'] }) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({ email: '', role: 'member', surfaces: ['desk'] as string[] });
    const close = () => { clearErrors(); onClose(); };
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/settings/team/invite', { onSuccess: () => { reset(); onClose(); } }); };
    const toggle = (v: string) => setData('surfaces', data.surfaces.includes(v) ? data.surfaces.filter((x) => x !== v) : [...data.surfaces, v]);

    return (
        <Dialog open={open} onClose={close} title="Invite someone" description="They get a link to join this organization with the role and access you choose here." width={600}>
            <form onSubmit={submit}>
                <Field label="Email" error={errors.email}>
                    <input className="v-field" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} placeholder="name@company.com" autoFocus />
                </Field>
                <Field label="Role" hint="Choosing a role presets what they can open; adjust below." error={errors.role}>
                    <select className="v-field" value={data.role} onChange={(e) => { const r = roles.find((x) => x.value === e.target.value); setData({ ...data, role: e.target.value, surfaces: r?.default_surfaces ?? data.surfaces }); }}>
                        {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                </Field>
                <Field label="Can open" error={errors.surfaces}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {surfaces.map((s) => {
                            const on = data.surfaces.includes(s.value);
                            return (
                                <button
                                    key={s.value}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={on}
                                    onClick={() => toggle(s.value)}
                                    className="flex items-start gap-3 rounded-lg p-4 text-left transition-colors"
                                    style={{ background: on ? 'var(--accent-subtle)' : 'var(--surface)', boxShadow: `inset 0 0 0 1px ${on ? 'var(--border-accent)' : 'var(--border-strong)'}` }}
                                >
                                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px]" style={{ background: on ? 'var(--accent)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: 'var(--text-on-accent)' }}>
                                        {on && <Check size={11} strokeWidth={3} />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-base font-medium text-primary">{s.label}</span>
                                        <span className="mt-0.5 block text-sm text-secondary">{s.tagline}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </Field>
                <DialogActions>
                    <button type="button" className="v-btn v-btn--ghost" onClick={close}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.email || data.surfaces.length === 0}>{processing ? 'Sending…' : 'Send invitation'}</button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
