import type { ReactNode } from 'react';

import CommandPalette from '../components/shell/command-palette';
import MobileNav from '../components/shell/mobile-nav';
import Sidebar from '../components/shell/sidebar';
import Toaster from '../components/ui/toaster';

/**
 * Veyra Desk — the operator's workspace.
 *
 * One scroll, the document's, with a sticky full-height sidebar (see
 * studio-layout for why there is no inner scrolling <main>).
 *
 * `rail` collapses the sidebar to icons and gives the page a fixed
 * full-viewport frame: the inbox runs four panes that scroll on their own.
 * Pages render their own content column (Desk pages vary between tables,
 * boards and detail views), wrapped by DeskPage when they want the default.
 */
export default function DeskLayout({ children, rail = false }: { children: ReactNode; rail?: boolean }) {
    return (
        <div className={`flex bg-bg ${rail ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            <div className="sticky top-0 hidden h-screen shrink-0 self-start md:block">
                <Sidebar product="desk" rail={rail} />
            </div>
            <main className={`min-w-0 flex-1 ${rail ? 'flex h-screen flex-col overflow-hidden' : ''}`}>
                <MobileNav product="desk" />
                {rail ? <div className="min-h-0 flex-1">{children}</div> : children}
            </main>
            <CommandPalette />
            <Toaster />
        </div>
    );
}
