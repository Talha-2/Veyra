/**
 * Props every page receives, mirroring HandleInertiaRequests::share().
 *
 * Keep this in step with that method — it is the contract between the two
 * halves of the app and nothing checks it at build time.
 */

export type SurfaceKey = 'desk' | 'studio';

export interface AuthUser {
    id: number;
    name: string;
    email: string;
}

export interface OrganizationSummary {
    id: number;
    name: string;
    slug: string;
}

export interface SurfaceSummary {
    key: SurfaceKey;
    label: string;
    tagline: string;
    home: string;
}

export interface SharedProps {
    auth: { user: AuthUser | null };
    tenant: {
        current: OrganizationSummary;
    } | null;
    /** Optional prop — absent until something asks for it by key. */
    organizations?: OrganizationSummary[];
    /** Only the surfaces this user may open. Never render navigation from anything else. */
    surfaces: SurfaceSummary[];
    flash: {
        success?: string;
        warning?: string;
        error?: string;
        new_key?: string;
        new_webhook_secret?: string;
        test_result?: { status: number; ms: number | null; body: string };
        skill_test?: { scenario: string; reply: string; failed: boolean; steps: string[]; tokens: number };
    };
    [key: string]: unknown;
}

/** One entry in a surface's own sidebar. */
export interface NavItem {
    label: string;
    href: string;
    /** Matched against the current path to decide the active state. */
    match?: string;
}
