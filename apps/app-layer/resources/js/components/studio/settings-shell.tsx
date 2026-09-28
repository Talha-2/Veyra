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
 * each entry led by a small tinted icon, and the pane on the right with its
 * own title — so the list never pushes the pane down. Two columns from
 * 1280px; below that the list becomes a row of links above the pane. Kept as
 * a component rather than a layout so each settings page is still an
 * ordinary Studio page that gets StudioLayout automatically.
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
            <div className="grid gap-10 xl:grid-cols-[228px_minmax(0,1fr)] xl:gap-14">
                <nav aria-label="Settings" className="xl:sticky xl:top-12 xl:self-start">
                    {/* Below 1280px: one wrapping row of links above the pane. */}
                    <ul className="flex flex-wrap gap-2 xl:hidden">
                        {GROUPS.flatMap((g) => g.items).map((i) => (
                            <li key={i.href}><NavLink item={i} active={url.startsWith(i.href)} compact /></li>
                        ))}
                    </ul>
                    <div className="hidden flex-col gap-7 xl:flex">
                        <Eyebrow className="px-3 text-secondary">Settings</Eyebrow>
                        {GROUPS.map((g) => (
                            <div key={g.heading}>
                                <Eyebrow className="mb-2 block px-3">{g.heading}</Eyebrow>
                                <ul className="flex flex-col gap-0.5">
                                    {g.items.map((i) => (
                                        <li key={i.href}><NavLink item={i} active={url.startsWith(i.href)} /></li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                        <KeyHint />
                    </div>
                </nav>
                <div className="min-w-0 max-w-[880px]">
                    <PageHeader title={title} description={description} actions={actions} meta={meta} />
                    <div className="mt-3">{children}</div>
                </div>
            </div>
        </>
    );
}

function NavLink({ item, active, compact = false }: { item: Item; active: boolean; compact?: boolean }) {
    const Icon = item.icon;
    const color = toneColor(item.tone);

    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 text-base transition-colors hover:bg-surface-hover ${compact ? 'h-9 rounded-full pr-4 pl-1.5' : 'h-10 rounded-md px-3'}`}
            style={{
                background: active ? 'var(--accent-subtle)' : compact ? 'var(--surface)' : undefined,
                boxShadow: compact && !active ? 'inset 0 0 0 1px var(--border)' : undefined,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 500,
            }}
        >
            <span
                className="flex size-6.5 shrink-0 items-center justify-center rounded-[8px]"
                style={{ background: item.tone === 'muted' ? 'var(--surface-sunken)' : `color-mix(in srgb, ${color} 14%, transparent)`, color: item.tone === 'muted' ? 'var(--text-secondary)' : color }}
            >
                <Icon size={15} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
    );
}

/** Where developer credentials live, since people look for them in Settings first. */
function KeyHint() {
    return (
        <Link href="/studio/developer" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-tertiary transition-colors hover:text-primary">
            <KeyRound size={14} strokeWidth={1.8} />
            API keys live in Developer
        </Link>
    );
}
