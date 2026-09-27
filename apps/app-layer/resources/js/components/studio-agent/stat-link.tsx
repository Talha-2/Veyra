import { Link } from '@inertiajs/react';
import type { ComponentProps } from 'react';

import { StatTile } from '../ui/kit';

/**
 * A StatTile that goes to where its number is fixed. The whole tile is the
 * target and lifts on hover like any other card that navigates.
 *
 * `external` is for links into Desk: that is a different product, and
 * crossing over is a full navigation on purpose, never an Inertia visit.
 */
export function StatLink({ href, external = false, ...stat }: ComponentProps<typeof StatTile> & { href: string; external?: boolean }) {
    const className =
        'block h-full rounded-lg [&>div]:h-full [&>div]:transition-[box-shadow,border-color] [&>div]:duration-200 hover:[&>div]:border-border-strong hover:[&>div]:shadow-raised';

    return external ? (
        <a href={href} className={className}>
            <StatTile {...stat} />
        </a>
    ) : (
        <Link href={href} className={className}>
            <StatTile {...stat} />
        </Link>
    );
}
