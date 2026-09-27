import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import type { ComponentType, ReactNode } from 'react';

import DeskLayout from './layouts/desk-layout';
import StudioLayout from './layouts/studio-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Veyra';

/**
 * Declared here rather than imported: @inertiajs/react does not export its
 * internal `ReactComponent` type through the package's export map.
 */
type LayoutComponent = ComponentType<{ children: ReactNode }>;
/**
 * A page may set `layout` to a component (the common case, applied
 * automatically below) or to a function, which is how a page passes options to
 * its shell — the inbox does this to collapse the sidebar to an icon rail.
 */
type LayoutFunction = (page: ReactNode) => ReactNode;
type PageComponent = ComponentType<Record<string, unknown>> & {
    layout?: LayoutComponent | LayoutFunction;
};
type PageModule = { default: PageComponent };

createInertiaApp({
    title: (title) => (title ? `${title} — ${appName}` : appName),

    resolve: async (name) => {
        const page = await resolvePageComponent<PageModule>(
            `./pages/${name}.tsx`,
            import.meta.glob<PageModule>('./pages/**/*.tsx'),
        );

        const component = page.default;

        // Layout is chosen by which product the page lives under, not by the
        // page itself. This is what keeps the two surfaces from drifting: a new
        // page in pages/desk/ cannot accidentally render the Studio chrome, and
        // no page has to remember to declare its own shell.
        //
        // A page may still override by exporting its own `layout` — the inbox
        // will, because it owns the full viewport and has no room for a
        // standard header.
        if (component.layout === undefined) {
            if (name.startsWith('desk/')) {
                component.layout = DeskLayout;
            } else if (name.startsWith('studio/')) {
                component.layout = StudioLayout;
            }
        }

        return component;
    },

    setup({ el, App, props }) {
        // `el` is nullable in the type because the same signature covers SSR.
        // On the client Inertia always provides it; bail loudly rather than
        // render into nothing if that ever stops being true.
        if (!el) {
            throw new Error('Inertia root element missing — check @inertia in app.blade.php.');
        }

        createRoot(el).render(<App {...props} />);
    },

    progress: {
        color: '#e96b34', // Ember. The only progress colour in the system.
    },
});
