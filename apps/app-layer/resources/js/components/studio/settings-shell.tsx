import { Head, Link, usePage } from '@inertiajs/react';
import { Building2, GitBranch, KeyRound, MonitorSmartphone, Tags, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { PageHeader } from '../ui/page';
import { Eyebrow, type Tone, toneColor } from '../ui/primitives';
import type { SharedProps } from '../../types';

/**
 * Settings, on Z360's three-way split: organization, product, user.
 *
 * Laid out like macOS System Settings: a grouped source list on the left,
 * each entry led by a small tinted icon, and the pane on the right. Kept as a
 * component rather than a layout so each settings page is still an ordinary
 * Studio page that gets StudioLayout automatically.
 */
interface Item { label: string; href: string; icon: LucideIcon; tone: Tone }

const GROUPS: { heading: string; items: Item[] }[] = [
    { heading: 'Organization', items: [
        { label: 'Details', href: '/studio/settings/organization', icon: Building2, tone: 'info' },
        { label: 'Team & access', href: '/studio/settings/team', icon: Users, tone: 'accent' },
    ] },
    { heading: 'Product', items: [
        { label: 'Ticket types', href: '/studio/settings/ticket-types', icon: Tags, tone: 'warning' },
        { label: 'Lead pipelines', href: '/studio/settings/pipelines', icon: GitBranch, tone: 'success' },
    ] },
    { heading: 'You', items: [
        { label: 'Profile', href: '/studio/settings/profile', icon: UserRound, tone: 'info' },
        { label: 'Sessions', href: '/studio/settings/sessions', icon: MonitorSmartphone, tone: 'muted' },
    ] },
];

export default function SettingsShell({ title, description, actions, meta, children }: { title: string; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; children: ReactNode }) {
    const { url } = usePage<SharedProps>();

    return (
        <>
            <Head title={title} />
            <PageHeader eyebrow="Settings" title={title} description={description} actions={actions} meta={meta} />
            <div className="grid gap-8 lg:grid-cols-[208px_minmax(0,1fr)]">
                <nav aria-label="Settings" className="flex flex-wrap gap-x-6 gap-y-4 lg:sticky lg:top-6 lg:flex-col lg:flex-nowrap lg:self-start">
                    {GROUPS.map((g) => (
                        <div key={g.heading} className="min-w-45">
                            <Eyebrow className="mb-1.5 block px-2.5">{g.heading}</Eyebrow>
                            <ul className="flex flex-col gap-px">
                                {g.items.map((i) => (
                                    <li key={i.href}><NavLink item={i} active={url.startsWith(i.href)} /></li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    <KeyHint />
                </nav>
                <div className="min-w-0">{children}</div>
            </div>
        </>
    );
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
    const Icon = item.icon;
    const color = toneColor(item.tone);

    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors hover:bg-surface-hover"
            style={{ background: active ? 'var(--accent-subtle)' : undefined, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 600 : 500 }}
        >
            <span
                className="flex size-6 shrink-0 items-center justify-center rounded-[7px]"
                style={{ background: item.tone === 'muted' ? 'var(--surface-sunken)' : `color-mix(in srgb, ${color} 14%, transparent)`, color: item.tone === 'muted' ? 'var(--text-secondary)' : color }}
            >
                <Icon size={14} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
    );
}

/** Where developer credentials live, since people look for them in Settings first. */
function KeyHint() {
    return (
        <Link href="/studio/developer" className="hidden items-center gap-2 rounded-md px-2.5 py-2 text-xs text-tertiary transition-colors hover:text-primary lg:flex">
            <KeyRound size={14} strokeWidth={1.8} />
            API keys live in Developer
        </Link>
    );
}
