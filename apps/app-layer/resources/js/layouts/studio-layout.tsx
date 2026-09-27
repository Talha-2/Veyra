import type { ReactNode } from 'react';

import CommandPalette from '../components/shell/command-palette';
import Sidebar from '../components/shell/sidebar';
import Toaster from '../components/ui/toaster';

/**
 * Veyra Studio — the builder.
 *
 * Roomier than Desk: Studio is visited to change how the agent behaves, not
 * to sit in all day, so it optimises for reading and deciding — a 1080px
 * column with generous rhythm between sections.
 *
 * `flush` hands a page the whole pane (Ask needs it; a settings form does not).
 */
export default function StudioLayout({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
            <Sidebar product="studio" />
            <main className={`min-w-0 flex-1 ${flush ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                {flush ? children : <div className="mx-auto w-full max-w-[1080px] px-6 pt-8 pb-20 md:px-10 md:pt-10">{children}</div>}
            </main>
            <CommandPalette />
            <Toaster />
        </div>
    );
}
