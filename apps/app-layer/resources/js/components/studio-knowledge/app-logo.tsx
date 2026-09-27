import { useState } from 'react';

/**
 * An app's mark: its logo on a quiet tile, or a monogram when there is no
 * logo (or it fails to load). One component so the catalog and the
 * Integrations page draw the same app the same way.
 */
export function AppLogo({ name, logo, size = 36 }: { name: string; logo: string | null | undefined; size?: number }) {
    const [broken, setBroken] = useState(false);
    const radius = size >= 44 ? 12 : 10;
    const text = size >= 44 ? 'text-lg' : size >= 32 ? 'text-md' : 'text-xs';

    if (logo && !broken) {
        return (
            <span className="flex shrink-0 items-center justify-center overflow-hidden" style={{ width: size, height: size, borderRadius: radius, background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                <img src={logo} alt="" onError={() => setBroken(true)} style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62), objectFit: 'contain' }} />
            </span>
        );
    }

    return (
        <span aria-hidden="true" className={`flex shrink-0 items-center justify-center font-semibold text-secondary select-none ${text}`} style={{ width: size, height: size, borderRadius: radius, background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
    );
}
