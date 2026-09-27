import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { Menu } from '../shell/menu';

/**
 * The "…" at the end of a row: where the rare and the destructive actions
 * live, so the row itself stays quiet.
 */
export function RowMenu({ label, children, width = 220, side = 'bottom' }: { label: string; children: (close: () => void) => ReactNode; width?: number; side?: 'top' | 'bottom' }) {
    return (
        <Menu
            align="right"
            side={side}
            width={width}
            trigger={(open, toggle) => (
                <button type="button" className="v-btn v-btn--ghost v-btn--icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                    <MoreHorizontal size={16} strokeWidth={2} />
                </button>
            )}
        >
            {children}
        </Menu>
    );
}
