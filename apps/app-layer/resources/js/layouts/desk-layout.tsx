import { useState, type ReactNode } from 'react';
import { usePage } from '@inertiajs/react';

import CommandPalette from '../components/shell/command-palette';
import MobileNav from '../components/shell/mobile-nav';
import Sidebar, { ProductSwitcher, AccountMenu } from '../components/shell/sidebar';
import Toaster from '../components/ui/toaster';

/**
 * Veyra Desk — the operator's workspace.
 *
 * One scroll, the document's, with a sticky full-height sidebar (see
 * studio-layout for why there is no inner scrolling <main>).
 *
 * `rail` gives the page a fixed
 * full-viewport frame: the inbox runs four panes that scroll on their own.
 * Pages render their own content column (Desk pages vary between tables,
 * boards and detail views), wrapped by DeskPage when they want the default.
 */
export default function DeskLayout({ children, rail = false }: { children: ReactNode; rail?: boolean }) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const expanded = hovered || focused;
    const home = usePage().url.split('?')[0] === '/desk/modules';

    return (
        <div className={`flex bg-bg ${rail ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            {!home && <div className="sticky top-0 z-30 hidden h-screen w-16 shrink-0 self-start md:block">
                <div className="desk-navigation-reveal absolute inset-y-0 left-0" data-desk-navigation={expanded ? 'expanded' : 'collapsed'}
                    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
                    onPointerDown={() => setFocused(false)}
                    onFocusCapture={(event) => setFocused(event.target.matches(':focus-visible'))}
                    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
                    style={{ boxShadow: expanded ? 'var(--shadow-lg)' : undefined }}>
                    <Sidebar product="desk" rail={!expanded} expandable />
                </div>
            </div>}
            <main className={`min-w-0 flex-1 ${rail ? 'flex h-screen flex-col overflow-hidden' : ''}`}>
                {home ? <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4 md:px-10 lg:px-14"><div className="w-56 max-w-full"><ProductSwitcher product="desk" rail={false} escapeContainer /></div><div className="w-56 max-w-full"><AccountMenu product="desk" rail={false} escapeContainer side="bottom" /></div></header> : <MobileNav product="desk" />}
                {rail ? <div className="min-h-0 flex-1">{children}</div> : children}
            </main>
            <CommandPalette />
            <Toaster />
        </div>
    );
}
