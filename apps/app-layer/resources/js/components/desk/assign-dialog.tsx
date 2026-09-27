import { useForm } from '@inertiajs/react';
import { useEffect, type FormEvent } from 'react';

import Dialog from '../ui/dialog';
import { PeoplePicker } from '../desk-inbox/controls';
import type { TeamMember } from '../../types/desk';

/**
 * Assign or transfer. The note is what makes a transfer a transfer — the
 * next person needs to know why they got it, and it lands as a note on the
 * conversation so it is still there in a week.
 */
export default function AssignDialog({ open, onClose, conversationId, team, current }: {
    open: boolean; onClose: () => void; conversationId: number; team: TeamMember[]; current: number[];
}) {
    const { data, setData, post, processing, reset } = useForm({ assignee_ids: current, note: '' });

    useEffect(() => { setData('assignee_ids', current); }, [current.join(','), open]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = (e: FormEvent) => { e.preventDefault(); post(`/desk/inbox/${conversationId}/assign`, { preserveScroll: true, onSuccess: () => { reset('note'); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="Assign conversation" description="Whoever is ticked owns the next reply.">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <PeoplePicker team={team} value={data.assignee_ids} onChange={(ids) => setData('assignee_ids', ids)} />
                <div>
                    <label htmlFor="assign-note" className="v-label flex items-baseline justify-between">
                        Handover note <span className="text-xs font-normal text-tertiary">Optional</span>
                    </label>
                    <textarea id="assign-note" className="v-field h-auto py-2.5 text-base" rows={2} value={data.note} onChange={(e) => setData('note', e.target.value)} dir="auto"
                        placeholder="Why this is moving, and what has been promised" />
                    <p className="mt-1.5 text-xs text-tertiary">Saved as a note on the conversation, so it is still there next week.</p>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing}>{processing ? 'Saving…' : data.assignee_ids.length ? 'Assign' : 'Unassign'}</button>
                </div>
            </form>
        </Dialog>
    );
}
