import { useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';

import Dialog from '../ui/dialog';
import { SegmentedControl } from '../ui/kit';
import { FieldError } from '../desk-inbox/controls';
import { channelIcon } from '../desk-inbox/helpers';

/** Start a thread with someone who has not written first. SMS or email. */
export default function NewConversationDialog({ open, onClose, channels }: {
    open: boolean; onClose: () => void; channels: { value: string; label: string; composable: boolean }[];
}) {
    const { data, setData, post, processing, errors, reset } = useForm({ channel: 'sms', to: '', subject: '', body: '' });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/desk/inbox', { onSuccess: () => { reset(); onClose(); } }); };
    const options = channels.filter((c) => c.composable && c.value !== 'fax');
    const email = data.channel === 'email';

    return (
        <Dialog open={open} onClose={onClose} title="New conversation" description="Message someone who has not written in yet. You will be assigned to the thread.">
            <form onSubmit={submit} className="flex flex-col gap-4">
                {options.length > 1 && (
                    <SegmentedControl value={data.channel} onChange={(v) => setData('channel', v)}
                        options={options.map((c) => {
                            const Icon = channelIcon(c.value);
                            return { value: c.value, label: <><Icon size={14} strokeWidth={1.9} />{c.label}</> };
                        })} />
                )}
                <div>
                    <label htmlFor="new-to" className="v-label">{email ? 'Email address' : 'Phone number'}</label>
                    <input id="new-to" className="v-field" type={email ? 'email' : 'tel'} value={data.to} onChange={(e) => setData('to', e.target.value)}
                        placeholder={email ? 'name@example.com' : '+1 312 555 0142'} autoFocus />
                    <FieldError>{errors.to}</FieldError>
                </div>
                {email && (
                    <div>
                        <label htmlFor="new-subject" className="v-label">Subject</label>
                        <input id="new-subject" className="v-field" value={data.subject} onChange={(e) => setData('subject', e.target.value)} dir="auto" />
                        <FieldError>{errors.subject}</FieldError>
                    </div>
                )}
                <div>
                    <label htmlFor="new-body" className="v-label">Message</label>
                    <textarea id="new-body" className="v-field h-auto py-2.5 text-base" rows={4} value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" />
                    <FieldError>{errors.body}</FieldError>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Sending…' : 'Send'}</button>
                </div>
            </form>
        </Dialog>
    );
}
