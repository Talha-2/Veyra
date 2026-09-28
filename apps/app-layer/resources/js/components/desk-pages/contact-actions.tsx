import { useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';

import Dialog from '../ui/dialog';
import { SegmentedControl } from '../ui/kit';

/**
 * The quick actions on a contact's profile: write to them, or raise a ticket
 * about them. Both post to the same endpoints the inbox and the ticket board
 * use, so a message sent from here threads exactly like one sent from there.
 */

export function MessageDialog({ open, onClose, name, phone, email }: { open: boolean; onClose: () => void; name: string; phone: string | null; email: string | null }) {
    const initial = phone ? 'sms' : 'email';
    const { data, setData, post, processing, errors, reset } = useForm({ channel: initial, to: (phone ?? email) ?? '', subject: '', body: '' });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/inbox', { onSuccess: () => { reset(); onClose(); } }); };

    const pick = (channel: 'sms' | 'email') => {
        setData((d) => ({ ...d, channel, to: (channel === 'sms' ? phone : email) ?? '' }));
    };

    const options: { value: 'sms' | 'email'; label: string }[] = [];
    if (phone) options.push({ value: 'sms', label: 'SMS' });
    if (email) options.push({ value: 'email', label: 'Email' });

    return (
        <Dialog open={open} onClose={onClose} title={`Message ${name}`} width={620} description="Starts a conversation in the inbox, or continues the one already open on this channel.">
            <form onSubmit={submit} className="flex flex-col gap-5">
                {options.length > 1 && (
                    <SegmentedControl<'sms' | 'email'> value={data.channel as 'sms' | 'email'} onChange={pick} options={options} />
                )}
                <div>
                    <label className="v-label" htmlFor="msg-to">{data.channel === 'email' ? 'To (email)' : 'To (phone)'}</label>
                    <input id="msg-to" className="v-field" value={data.to} onChange={(e) => setData('to', e.target.value)} />
                    {errors.to && <p className="mt-1.5 text-sm text-danger">{errors.to}</p>}
                </div>
                {data.channel === 'email' && (
                    <div>
                        <label className="v-label" htmlFor="msg-subject">Subject</label>
                        <input id="msg-subject" className="v-field" value={data.subject} onChange={(e) => setData('subject', e.target.value)} dir="auto" />
                    </div>
                )}
                <div>
                    <label className="v-label" htmlFor="msg-body">Message</label>
                    <textarea id="msg-body" className="v-field text-md" rows={6} value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" autoFocus />
                    {errors.body && <p className="mt-1.5 text-sm text-danger">{errors.body}</p>}
                </div>
                <div className="mt-1 flex justify-end gap-2 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.body.trim() || !data.to.trim()}>{processing ? 'Sending…' : 'Send'}</button>
                </div>
            </form>
        </Dialog>
    );
}

export function TicketDialog({ open, onClose, contactId, name, types, priorities }: {
    open: boolean; onClose: () => void; contactId: number; name: string;
    types: { id: number; name: string; color: string }[];
    priorities: { value: string; label: string }[];
}) {
    const { data, setData, post, processing, errors, reset } = useForm({
        subject: '', body: '', priority: 'normal', ticket_type_id: (types[0]?.id ?? '') as number | '', contact_id: contactId, assignee_ids: [] as number[],
    });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        post('/desk/tickets', { onSuccess: () => { reset(); onClose(); } });
    };

    return (
        <Dialog open={open} onClose={onClose} title="New ticket" width={620} description={`Raised against ${name}, so it shows on their profile and in the team's board.`}>
            <form onSubmit={submit} className="flex flex-col gap-5">
                <div>
                    <label className="v-label" htmlFor="t-subject">Subject</label>
                    <input id="t-subject" className="v-field" value={data.subject} onChange={(e) => setData('subject', e.target.value)} dir="auto" autoFocus />
                    {errors.subject && <p className="mt-1.5 text-sm text-danger">{errors.subject}</p>}
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                        <label className="v-label" htmlFor="t-priority">Priority</label>
                        <select id="t-priority" className="v-field" value={data.priority} onChange={(e) => setData('priority', e.target.value)}>
                            {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </div>
                    {types.length > 0 && (
                        <div>
                            <label className="v-label" htmlFor="t-type">Type</label>
                            <select id="t-type" className="v-field" value={data.ticket_type_id} onChange={(e) => setData('ticket_type_id', e.target.value ? Number(e.target.value) : '')}>
                                <option value="">No type</option>
                                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                <div>
                    <label className="v-label" htmlFor="t-body">Details</label>
                    <textarea id="t-body" className="v-field text-md" rows={5} value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" placeholder="What happened, and what they need." />
                </div>
                <div className="mt-1 flex justify-end gap-2 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.subject.trim()}>{processing ? 'Creating…' : 'Create ticket'}</button>
                </div>
            </form>
        </Dialog>
    );
}
