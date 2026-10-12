import type { ReactNode } from 'react';

import CommandPalette from '../components/shell/command-palette';
import MobileNav from '../components/shell/mobile-nav';
import Sidebar from '../components/shell/sidebar';
import Toaster from '../components/ui/toaster';

/**
 * Veyra Studio — the builder.
 *
 * One scroll, the document's. The sidebar is sticky at full height, so it
 * never moves and never scrolls with the page; the content column is the
 * only thing that scrolls. (An inner scrolling <main> inside a scrolling
 * document produced two scrollbars and wheel events that went to the wrong
 * one.)
 *
 * `flush` hands a page the whole viewport as a fixed frame — Ask and the
 * voice console manage their own panes and inner scrolling.
 * Standard pages share one frame. `width` remains accepted for existing pages.
 */
export default function StudioLayout({ children, flush = false }: { children: ReactNode; flush?: boolean; width?: 'default' | 'wide' }) {
    return (
        <div className={`flex bg-bg ${flush ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            <div className="sticky top-0 hidden h-screen shrink-0 self-start md:block">
                <Sidebar product="studio" />
            </div>
            <main className={`min-w-0 flex-1 ${flush ? 'flex h-screen flex-col overflow-hidden' : ''}`}>
                <MobileNav product="studio" />
                {flush ? <div className="min-h-0 flex-1">{children}</div> : (
                    <div className="studio-page-frame mx-auto w-full max-w-[1440px] px-6 pt-10 pb-28 md:px-10 lg:px-14 lg:pt-12 min-[1800px]:max-w-[1640px]">
                        {children}
                    </div>
                )}
            </main>
            <CommandPalette />
            <Toaster />
        </div>
    );
}
