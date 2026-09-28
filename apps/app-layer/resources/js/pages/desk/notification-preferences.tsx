import { Head, useForm } from '@inertiajs/react';
import { AlertTriangle, Bell, CalendarClock, Inbox, Mail, Ticket, UserPlus, Workflow, type LucideIcon } from 'lucide-react';
import type { FormEvent } from 'react';

import { SaveBar } from '../../components/studio/form';
import { DeskPage, Panel } from '../../components/desk-pages/layout';
import { IconTile, Switch } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Eyebrow, type Tone } from '../../components/ui/primitives';

interface Props {
    events: { key: string; label: string }[];
    channels: Record<string, { in_app: boolean; email: boolean }>;
}

type Channel = 'in_app' | 'email';

/** What each event is for, so the choice carries its consequence. */
const EVENT_META: Record<string, { hint: string; icon: LucideIcon; tone: Tone }> = {
    'conversation.assigned': { hint: 'Someone, or the agent, hands you a thread to answer.', icon: UserPlus, tone: 'info' },
    'conversation.unassigned_new': { hint: 'Useful for whoever triages. Noisy for everyone else.', icon: Inbox, tone: 'warning' },
    'ticket.assigned': { hint: 'A ticket lands on you, by hand or by its type’s default.', icon: Ticket, tone: 'info' },
    'ticket.agent_raised': { hint: 'The agent told a caller the team would follow up.', icon: Ticket, tone: 'accent' },
    'action.needs_review': { hint: 'An action timed out and may or may not have happened. Worth email.', icon: AlertTriangle, tone: 'danger' },
    'automation.failed': { hint: 'A workflow stopped partway through.', icon: Workflow, tone: 'danger' },
    'reminder.due': { hint: 'A reminder you set on a conversation or contact comes due.', icon: CalendarClock, tone: 'warning' },
};

const DEFAULT: { in_app: boolean; email: boolean } = { in_app: true, email: false };

export default function NotificationPreferences({ events, channels }: Props) {
    const { data, setData, put, processing, isDirty, reset } = useForm({ channels });
    const submit = (e: FormEvent) => { e.preventDefault(); put('/desk/notifications/preferences', { preserveScroll: true }); };
    const get = (key: string) => data.channels[key] ?? DEFAULT;
    const set = (key: string, channel: Channel, value: boolean) => setData('channels', { ...data.channels, [key]: { ...get(key), [channel]: value } });

    const allOn = (channel: Channel) => events.length > 0 && events.every((e) => get(e.key)[channel]);
    const setAll = (channel: Channel, value: boolean) =>
        setData('channels', Object.fromEntries(events.map((e) => [e.key, { ...get(e.key), [channel]: value }])) as Props['channels']);

    return (
        <>
            <Head title="Notification preferences" />
            <DeskPage width="narrow" header={
                <PageHeader
                    back={{ href: '/desk/notifications', label: 'Notifications' }}
                    title="What reaches you"
                    description="Choose, event by event, whether it shows in Desk, arrives by email, or both. These settings are yours alone and apply to this organization."
                />
            }>
                <form onSubmit={submit} className="flex flex-col gap-4">
                    <Panel className="overflow-hidden">
                        <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-x-2 px-7 py-4" style={{ borderBottom: '1px solid var(--separator)', background: 'var(--bg-subtle)' }}>
                            <Eyebrow>Event</Eyebrow>
                            <ColumnHead icon={<Bell size={14} strokeWidth={1.8} />} label="In Desk" checked={allOn('in_app')} onChange={(v) => setAll('in_app', v)} />
                            <ColumnHead icon={<Mail size={14} strokeWidth={1.8} />} label="Email" checked={allOn('email')} onChange={(v) => setAll('email', v)} />
                        </div>

                        <ul className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                            {events.map((e) => {
                                const meta = EVENT_META[e.key] ?? { hint: '', icon: Bell, tone: 'muted' as Tone };
                                const Icon = meta.icon;
                                const value = get(e.key);
                                return (
                                    <li key={e.key} className="grid min-h-18 grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-x-2 px-7 py-4">
                                        <div className="flex min-w-0 items-start gap-3.5">
                                            <IconTile tone={meta.tone} size={34}><Icon size={15} strokeWidth={1.8} /></IconTile>
                                            <div className="min-w-0">
                                                <div className="text-base font-medium text-primary">{e.label}</div>
                                                {meta.hint && <div className="mt-0.5 text-sm text-secondary">{meta.hint}</div>}
                                            </div>
                                        </div>
                                        <div className="flex justify-center"><Switch checked={value.in_app} onChange={(v) => set(e.key, 'in_app', v)} label={`${e.label} in Desk`} /></div>
                                        <div className="flex justify-center"><Switch checked={value.email} onChange={(v) => set(e.key, 'email', v)} label={`${e.label} by email`} /></div>
                                    </li>
                                );
                            })}
                        </ul>
                    </Panel>

                    <p className="px-1 text-sm text-tertiary">Email goes to the address on your profile. Turning both off means you only see the event if you go looking.</p>

                    <SaveBar processing={processing} dirty={isDirty} label="Save preferences" onDiscard={() => reset()} />
                </form>
            </DeskPage>
        </>
    );
}

function ColumnHead({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary">{icon}{label}</span>
            <Switch size="sm" checked={checked} onChange={onChange} label={checked ? `Turn off all ${label}` : `Turn on all ${label}`} />
        </div>
    );
}
