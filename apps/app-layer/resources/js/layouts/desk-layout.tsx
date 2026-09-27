import type { ReactNode } from 'react';

import CommandPalette from '../components/shell/command-palette';
import Sidebar from '../components/shell/sidebar';
import Toaster from '../components/ui/toaster';

/**
 * Veyra Desk — the operator's workspace.
 *
 * Denser than Studio: someone sits in this for a whole shift, so it trades
 * whitespace for rows on screen. `rail` collapses the sidebar to icons for
 * the inbox, which needs four panes of its own.
 */
export default function DeskLayout({ children, rail = false }: { children: ReactNode; rail?: boolean }) {
    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
            <Sidebar product="desk" rail={rail} />
            <main className={`min-w-0 flex-1 ${rail ? 'overflow-hidden' : 'overflow-y-auto'}`}>{children}</main>
            <CommandPalette />
            <Toaster />
        </div>
    );
}
