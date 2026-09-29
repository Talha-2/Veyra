import { Link, router, usePage } from '@inertiajs/react';
import { Building2, Check, ChevronsUpDown, LogOut, Monitor, Moon, Search, Sun, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { SharedProps, SurfaceKey } from '../../types';
import { ComingSoon } from '../ui/coming-soon';
import { Avatar, Kbd } from '../ui/primitives';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './menu';
import { NAV, isActive } from './nav';

/**
 * The product sidebar — Desk's and Studio's, one component with each
 * product's own navigation. It carries everything that is about the account
 * rather than the page: which product, which organization, search, and you.
 *
 * `rail` collapses it to icons, for screens (the inbox) that need the width.
 */
export default function Sidebar({ product, rail = false }: { product: SurfaceKey; rail?: boolean }) {
    const { url } = usePage<SharedProps>();
    const groups = NAV[product];

    return (
        <aside className={`flex h-full shrink-0 flex-col ${rail ? 'w-[64px] items-center' : 'w-[248px]'}`} style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--border)' }} aria-label={`Veyra ${product === 'studio' ? 'Studio' : 'Desk'}`}>
            <div className={rail ? 'pt-3' : 'px-3 pt-3'}>
                <ProductSwitcher product={product} rail={rail} />
            </div>

            <div className={rail ? 'pt-2' : 'px-3 pt-2'}>
                <button type="button" onClick={() => window.dispatchEvent(new Event('veyra:palette'))}
                    className={`flex items-center gap-2 rounded-lg text-sm text-tertiary transition-colors hover:text-secondary ${rail ? 'size-9 justify-center' : 'h-8 w-full px-2.5'}`}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)' }} aria-label="Search">
                    <Search size={14} strokeWidth={2} />
                    {!rail && <><span className="flex-1 text-left">Search</span><Kbd>⌘K</Kbd></>}
                </button>
            </div>

            <nav className={`min-h-0 flex-1 overflow-y-auto ${rail ? 'flex flex-col items-center gap-1 py-3' : 'px-3 py-3'}`}>
                {groups.map((group, gi) => (
                    <div key={gi} className={rail ? 'flex flex-col items-center gap-1' : 'mb-5 last:mb-0'}>
                        {group.heading && !rail && <div className="v-eyebrow mb-1.5 px-2.5">{group.heading}</div>}
                        {rail && gi > 0 && <div className="my-1 h-px w-6" style={{ background: 'var(--separator)' }} />}
                        <div className={rail ? 'flex flex-col items-center gap-1' : 'flex flex-col gap-px'}>
                            {group.items.map((item) => {
                                const active = isActive(item, url);
                                const Icon = item.icon;
                                return (
                                    <Link key={item.href} href={item.href} prefetch aria-current={active ? 'page' : undefined}
                                        aria-label={rail ? (item.soon ? `${item.label} (coming soon)` : item.label) : undefined}
                                        title={rail ? (item.soon ? `${item.label} · Coming soon` : item.label) : undefined}
                                        className={`group flex items-center rounded-lg transition-colors ${rail ? 'size-9 justify-center' : 'h-8 gap-2.5 px-2.5 text-sm font-medium'}`}
                                        style={{
                                            background: active ? 'var(--surface)' : undefined,
                                            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            boxShadow: active ? 'var(--shadow-card)' : undefined,
                                        }}>
                                        <Icon size={rail ? 18 : 16} strokeWidth={active ? 2.1 : 1.8} style={{ color: active ? 'var(--accent)' : undefined }} className={active ? '' : 'opacity-80 group-hover:opacity-100'} />
                                        {!rail && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                                        {!rail && item.soon && <ComingSoon compact />}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className={rail ? 'pb-3' : 'p-3'} style={{ borderTop: rail ? undefined : '1px solid var(--separator)' }}>
                <AccountMenu rail={rail} product={product} />
            </div>
        </aside>
    );
}

/** The Veyra mark: a waveform in the accent on an ink tile. */
export function VeyraMark({ size = 28 }: { size?: number }) {
    return (
        <span className="flex shrink-0 items-center justify-center rounded-[9px]" style={{ width: size, height: size, background: 'linear-gradient(145deg, #2a2a2e, #111113)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.2)' }} aria-hidden="true">
            <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 16 16">
                {[[2, 6, 10], [5, 3, 13], [8, 5, 11], [11, 2, 14], [14, 6, 10]].map(([x, y1, y2]) => (
                    <line key={x} x1={x} y1={y1} x2={x} y2={y2} stroke="#f07a45" strokeWidth="1.9" strokeLinecap="round" />
                ))}
            </svg>
        </span>
    );
}

function ProductSwitcher({ product, rail }: { product: SurfaceKey; rail: boolean }) {
    const { surfaces, tenant, organizations } = usePage<SharedProps>().props;
    const current = surfaces.find((s) => s.key === product);

    return (
        <Menu width={272} trigger={(open, toggle) => (
            <button type="button" onClick={() => { toggle(); if (!organizations) router.reload({ only: ['organizations'] }); }} aria-expanded={open} aria-haspopup="menu"
                className={`flex items-center gap-2.5 rounded-xl transition-colors hover:bg-surface-hover ${rail ? 'size-10 justify-center' : 'w-full px-1.5 py-1.5'}`} style={{ background: open ? 'var(--surface-hover)' : undefined }}>
                <VeyraMark size={rail ? 30 : 30} />
                {!rail && (
                    <>
                        <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-sm font-semibold text-primary">{current?.label ?? 'Veyra'}</span>
                            <span className="block truncate text-xs text-tertiary">{tenant?.current.name}</span>
                        </span>
                        <ChevronsUpDown size={14} className="shrink-0 text-tertiary" />
                    </>
                )}
            </button>
        )}>
            {(close) => (
                <>
                    {surfaces.length > 1 && (
                        <>
                            <MenuLabel>Products</MenuLabel>
                            {surfaces.map((s) => (
                                <MenuItem key={s.key} onSelect={() => { close(); router.visit(s.home); }} active={s.key === product} trailing={s.key === product ? <Check size={14} className="text-accent" /> : undefined}>
                                    <span className="block font-medium">{s.label}</span>
                                    <span className="block truncate text-xs text-tertiary">{s.tagline}</span>
                                </MenuItem>
                            ))}
                            <MenuSeparator />
                        </>
                    )}
                    <MenuLabel>Organizations</MenuLabel>
                    {(organizations ?? (tenant ? [tenant.current] : [])).map((o) => (
                        <MenuItem key={o.id} icon={<Building2 size={14} />} onSelect={() => { close(); if (o.id !== tenant?.current.id) router.post(`/organizations/${o.id}/switch`); }} active={o.id === tenant?.current.id} trailing={o.id === tenant?.current.id ? <Check size={14} className="text-accent" /> : undefined}>
                            {o.name}
                        </MenuItem>
                    ))}
                </>
            )}
        </Menu>
    );
}

type ThemeChoice = 'light' | 'dark' | 'system';

function applyTheme(choice: ThemeChoice) {
    const resolved = choice === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice;
    document.documentElement.setAttribute('data-theme', resolved);
    try {
        if (choice === 'system') localStorage.removeItem('veyra-theme');
        else localStorage.setItem('veyra-theme', choice);
    } catch {
        // Blocked storage: the theme applies for this page and is not remembered.
    }
}

function AccountMenu({ rail, product }: { rail: boolean; product: SurfaceKey }) {
    const { auth, surfaces } = usePage<SharedProps>().props;
    const [theme, setTheme] = useState<ThemeChoice>('system');

    useEffect(() => {
        try { setTheme((localStorage.getItem('veyra-theme') as ThemeChoice) ?? 'system'); } catch { /* default */ }
    }, []);

    if (!auth.user) return null;
    const name = auth.user.name;
    const initials = name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const hasStudio = surfaces.some((s) => s.key === 'studio');

    return (
        <Menu side="top" width={248} trigger={(open, toggle) => (
            <button type="button" onClick={toggle} aria-expanded={open} aria-label="Account"
                className={`flex items-center gap-2.5 rounded-xl transition-colors hover:bg-surface-hover ${rail ? 'size-10 justify-center' : 'w-full px-1.5 py-1.5'}`} style={{ background: open ? 'var(--surface-hover)' : undefined }}>
                <Avatar initials={initials} name={name} size={28} />
                {!rail && (
                    <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-medium text-primary">{name}</span>
                        <span className="block truncate text-xs text-tertiary">{auth.user!.email}</span>
                    </span>
                )}
            </button>
        )}>
            {(close) => (
                <>
                    <MenuLabel>Appearance</MenuLabel>
                    <div className="mx-1 mb-1 grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: 'var(--surface-sunken)' }}>
                        {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'Auto']] as const).map(([value, Icon, label]) => (
                            <button key={value} type="button" onClick={() => { setTheme(value); applyTheme(value); }}
                                className="flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-all"
                                style={{ background: theme === value ? 'var(--surface-raised)' : 'transparent', color: theme === value ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: theme === value ? 'var(--shadow-card)' : 'none' }}>
                                <Icon size={12} />{label}
                            </button>
                        ))}
                    </div>
                    <MenuSeparator />
                    {hasStudio && <MenuItem icon={<UserRound size={14} />} onSelect={() => { close(); router.visit('/studio/settings/profile'); }}>Profile & password</MenuItem>}
                    {product === 'studio' && hasStudio && <MenuItem icon={<Building2 size={14} />} onSelect={() => { close(); router.visit('/studio/settings/organization'); }}>Organization settings</MenuItem>}
                    <MenuSeparator />
                    <MenuItem icon={<LogOut size={14} />} onSelect={() => { close(); router.post('/logout'); }}>Sign out</MenuItem>
                </>
            )}
        </Menu>
    );
}
