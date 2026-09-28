import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, Bell, CalendarClock, CheckCheck, Inbox, Settings, Ticket, UserPlus, Workflow, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { clockTime, isToday } from '../../components/desk-pages/format';
import { DeskPage, Panel } from '../../components/desk-pages/layout';
import { IconTile, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, Eyebrow, RelativeTime, UserText, type Tone } from '../../components/ui/primitives';

interface Notification { id: string; type: string; title: string; body: string | null; url: string | null; read: boolean; at: string }
interface Props {
    notifications: Notification[];
    unread: number;
}

const KINDS: Record<string, { icon: LucideIcon; tone: Tone }> = {
    'conversation.assigned': { icon: UserPlus, tone: 'info' },
    'conversation.unassigned_new': { icon: Inbox, tone: 'warning' },
    'ticket.assigned': { icon: Ticket, tone: 'info' },
    'ticket.agent_raised': { icon: Ticket, tone: 'accent' },
    'action.needs_review': { icon: AlertTriangle, tone: 'danger' },
    'automation.failed': { icon: Workflow, tone: 'danger' },
    'reminder.due': { icon: CalendarClock, tone: 'warning' },
};

function kindOf(type: string) {
    return KINDS[type] ?? { icon: Bell, tone: 'muted' as Tone };
}

/**
 * Notifications, grouped the way Notification Center groups them: what came
 * in today, and everything before. Opening one marks it read.
 */
export default function Notifications({ notifications, unread }: Props) {
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const visible = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;
    const groups = [
        { label: 'Today', items: visible.filter((n) => isToday(n.at)) },
        { label: 'Earlier', items: visible.filter((n) => !isToday(n.at)) },
    ].filter((g) => g.items.length > 0);

    // Mark read first, then follow the link, so the read request is not
    // cancelled by the navigation it precedes.
    const open = (n: Notification, e?: React.MouseEvent) => {
        if (n.read) return;
        const go = () => {
            if (!n.url) return;
            if (n.url.startsWith('/')) router.visit(n.url);
            else window.location.href = n.url;
        };
        if (n.url && e && !e.metaKey && !e.ctrlKey && !e.shiftKey) e.preventDefault();
        else if (n.url) { router.post(`/desk/notifications/${n.id}/read`, {}, { preserveScroll: true }); return; }
        router.post(`/desk/notifications/${n.id}/read`, {}, { preserveScroll: true, onFinish: go });
    };

    return (
        <>
            <Head title="Notifications" />
            <DeskPage width="narrow" header={
                    <PageHeader
                        title="Notifications"
                        description={unread > 0 ? `${unread} unread. Opening one marks it read.` : 'You are all caught up.'}
                        actions={
                            <>
                                <Link href="/desk/notifications/preferences" className="v-btn v-btn--ghost"><Settings size={14} strokeWidth={1.8} />Preferences</Link>
                                {unread > 0 && (
                                    <button type="button" className="v-btn v-btn--primary" onClick={() => router.post('/desk/notifications/read-all', {}, { preserveScroll: true })}>
                                        <CheckCheck size={14} strokeWidth={2} />Mark all read
                                    </button>
                                )}
                            </>
                        }
                    />
            }>
                <section className="flex flex-col gap-10">
                    {notifications.length > 0 && (
                        <div className="-mb-4">
                            <SegmentedControl value={filter} onChange={setFilter} options={[
                                { value: 'all', label: 'All' },
                                { value: 'unread', label: <>Unread{unread > 0 && <span className="text-2xs text-tertiary tabular-nums">{unread}</span>}</> },
                            ]} />
                        </div>
                    )}

                    {groups.length === 0 ? (
                        <Panel>
                            <EmptyState icon={<Bell size={20} strokeWidth={1.8} />} title={filter === 'unread' ? 'Nothing unread' : 'No notifications'}
                                action={<Link href="/desk/notifications/preferences" className="v-btn v-btn--quiet">Choose what reaches you</Link>}>
                                Assignments, tickets the agent raises and actions that need a human to check will appear here.
                            </EmptyState>
                        </Panel>
                    ) : (
                        groups.map((g) => (
                            <section key={g.label}>
                                <div className="mb-3 flex items-center justify-between px-1">
                                    <Eyebrow>{g.label}</Eyebrow>
                                    <span className="text-xs text-tertiary tabular-nums">{g.items.length}</span>
                                </div>
                                <Panel className="overflow-hidden">
                                    <ul className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                                        {g.items.map((n) => {
                                            const kind = kindOf(n.type);
                                            const Icon = kind.icon;
                                            const body = (
                                                <>
                                                    <span className="flex w-2 shrink-0 justify-center pt-4" aria-hidden="true">
                                                        {!n.read && <span className="size-2 rounded-full" style={{ background: 'var(--accent)' }} />}
                                                    </span>
                                                    <IconTile tone={kind.tone}><Icon size={16} strokeWidth={1.8} /></IconTile>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-baseline justify-between gap-3">
                                                            <span className={`truncate text-base ${n.read ? 'font-normal text-secondary' : 'font-semibold text-primary'}`}><UserText>{n.title}</UserText></span>
                                                            <span className="shrink-0">{isToday(n.at) ? <time dateTime={n.at} className="text-xs text-tertiary tabular-nums" title={new Date(n.at).toLocaleString()}>{clockTime(n.at)}</time> : <RelativeTime at={n.at} />}</span>
                                                        </span>
                                                        {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-secondary"><UserText>{n.body}</UserText></span>}
                                                        {!n.read && kind.tone === 'danger' && <span className="mt-1.5 block"><Badge tone="danger">Needs a person</Badge></span>}
                                                    </span>
                                                </>
                                            );
                                            const className = 'flex min-h-16 w-full items-start gap-3.5 py-4 pr-7 pl-4 text-left transition-colors hover:bg-surface-hover';
                                            return (
                                                <li key={n.id} style={{ background: n.read ? undefined : 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
                                                    {n.url
                                                        ? <a href={n.url} onClick={(e) => open(n, e)} className={className}>{body}</a>
                                                        : <button type="button" onClick={() => open(n)} className={className} disabled={n.read}>{body}</button>}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </Panel>
                            </section>
                        ))
                    )}
                </section>
            </DeskPage>
        </>
    );
}
