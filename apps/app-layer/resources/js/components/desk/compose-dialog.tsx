import { useForm } from '@inertiajs/react';
import type { FormEvent, ReactNode } from 'react';

import Dialog from '../ui/dialog';
import { FieldError, PeoplePicker } from '../desk-inbox/controls';
import type { TeamMember } from '../../types/desk';

export type Composition = 'note' | 'reminder' | 'ticket';

/**
 * Things you create *on* a conversation that need more than a line of text.
 * A plain note is written in the composer itself (its Note mode); reminders
 * and tickets have fields, so they get a sheet.
 */
export default function ComposeDialog({
    composition, onClose, conversationId, team, ticketTypes,
}: {
    composition: Composition | null; onClose: () => void; conversationId: number;
    team: TeamMember[]; ticketTypes: { id: number; name: string; color: string }[];
}) {
    return (
        <>
            <NoteDialog open={composition === 'note'} onClose={onClose} conversationId={conversationId} />
            <ReminderDialog open={composition === 'reminder'} onClose={onClose} conversationId={conversationId} team={team} />
            <TicketDialog open={composition === 'ticket'} onClose={onClose} conversationId={conversationId} team={team} ticketTypes={ticketTypes} />
        </>
    );
}

function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: string }) {
    return (
        <label htmlFor={htmlFor} className="v-label flex items-baseline justify-between gap-3">
            {children}
            {hint && <span className="text-xs font-normal text-tertiary">{hint}</span>}
        </label>
    );
}

function NoteDialog({ open, onClose, conversationId }: { open: boolean; onClose: () => void; conversationId: number }) {
    const { data, setData, post, processing, errors, reset } = useForm({ body: '' });
    const submit = (e: FormEvent) => { e.preventDefault(); post(`/desk/inbox/${conversationId}/notes`, { preserveScroll: true, onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="Add an internal note" description="Visible to the team, never to the customer. Ctrl or ⌘ + Enter saves." width={560}>
            <form onSubmit={submit}>
                <textarea className="v-field text-md" rows={5} value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" placeholder="What the next person should know" aria-label="Note" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                <FieldError>{errors.body}</FieldError>
                <Footer onClose={onClose} processing={processing} label="Save note" disabled={!data.body.trim()} />
            </form>
        </Dialog>
    );
}

function ReminderDialog({ open, onClose, conversationId, team }: { open: boolean; onClose: () => void; conversationId: number; team: TeamMember[] }) {
    const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(9, 0, 0, 0);
    const { data, setData, post, processing, errors, reset } = useForm({ text: '', due_at: tomorrow.toISOString().slice(0, 16), user_id: '' });
    const submit = (e: FormEvent) => { e.preventDefault(); post(`/desk/inbox/${conversationId}/reminders`, { preserveScroll: true, onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="Set a reminder" description="It sits in the thread and the details pane until it is done.">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <Label htmlFor="reminder-text">What</Label>
                    <input id="reminder-text" className="v-field" value={data.text} onChange={(e) => setData('text', e.target.value)} dir="auto" placeholder="Call back about the Thursday slot" autoFocus />
                    <FieldError>{errors.text}</FieldError>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Label htmlFor="reminder-due">When</Label>
                        <input id="reminder-due" type="datetime-local" className="v-field" value={data.due_at} onChange={(e) => setData('due_at', e.target.value)} />
                        <FieldError>{errors.due_at}</FieldError>
                    </div>
                    <div>
                        <Label htmlFor="reminder-for">For</Label>
                        <select id="reminder-for" className="v-field" value={data.user_id} onChange={(e) => setData('user_id', e.target.value)}>
                            <option value="">Me</option>
                            {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                </div>
                <Footer onClose={onClose} processing={processing} label="Set reminder" disabled={!data.text.trim()} />
            </form>
        </Dialog>
    );
}

function TicketDialog({ open, onClose, conversationId, team, ticketTypes }: {
    open: boolean; onClose: () => void; conversationId: number; team: TeamMember[]; ticketTypes: { id: number; name: string; color: string }[];
}) {
    const { data, setData, post, processing, errors, reset } = useForm({ subject: '', body: '', priority: 'normal', ticket_type_id: '', assignee_ids: [] as number[] });
    const submit = (e: FormEvent) => { e.preventDefault(); post(`/desk/inbox/${conversationId}/tickets`, { preserveScroll: true, onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="Raise a ticket" description="Linked to this conversation and its contact." width={560}>
            <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                    <Label htmlFor="ticket-subject">Subject</Label>
                    <input id="ticket-subject" className="v-field" value={data.subject} onChange={(e) => setData('subject', e.target.value)} dir="auto" placeholder="Refund the double charge on 14 Sep" autoFocus />
                    <FieldError>{errors.subject}</FieldError>
                </div>
                <div>
                    <Label htmlFor="ticket-body" hint="Optional">Details</Label>
                    <textarea id="ticket-body" className="v-field h-auto py-2.5 text-base" rows={3} value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Label htmlFor="ticket-priority">Priority</Label>
                        <select id="ticket-priority" className="v-field" value={data.priority} onChange={(e) => setData('priority', e.target.value)}>
                            {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                        </select>
                        <FieldError>{errors.priority}</FieldError>
                    </div>
                    <div>
                        <Label htmlFor="ticket-type">Type</Label>
                        <select id="ticket-type" className="v-field" value={data.ticket_type_id} onChange={(e) => setData('ticket_type_id', e.target.value)}>
                            <option value="">None</option>
                            {ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <Label hint="Leave empty to use the type's default people">Assign to</Label>
                    <PeoplePicker team={team} value={data.assignee_ids} onChange={(ids) => setData('assignee_ids', ids)} maxHeight={200} />
                </div>
                <Footer onClose={onClose} processing={processing} label="Create ticket" disabled={!data.subject.trim()} />
            </form>
        </Dialog>
    );
}

function Footer({ onClose, processing, label, disabled = false }: { onClose: () => void; processing: boolean; label: string; disabled?: boolean }) {
    return (
        <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="v-btn v-btn--primary" disabled={processing || disabled}>{processing ? 'Saving…' : label}</button>
        </div>
    );
}
