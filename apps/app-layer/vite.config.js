import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
            fonts: [
                // Latin is Poppins, self-hosted from public/fonts/poppins and
                // declared in resources/css/app.css (400/500/600, latin +
                // latin-ext) — not fetched at build time.

                // Urdu. Poppins has no Arabic glyphs, so without this the script
                // falls through to whatever the OS happens to have — usually a
                // Naskh face, which is legible but wrong for Urdu.
                //
                // No unicode-range needed: font fallback resolves per character,
                // so listing this after Poppins in the stack means Latin keeps
                // Poppins and Arabic script picks this up automatically. Nothing
                // has to tag the language, which matters because `dir="auto"`
                // means we never know it. See docs/urdu-support.md.
                //
                // `subsets` is required, not optional. The plugin defaults to
                // ["latin"], which for a Nastaliq face means it ships a 12 KB
                // file declaring `unicode-range: U+0000-00FF` — Latin glyphs
                // from an Urdu font, and no Arabic coverage at all. The browser
                // then never matches it and falls back to a system Naskh face,
                // which looks close enough that it passes an untrained glance.
                bunny('Noto Nastaliq Urdu', { weights: [400, 600], subsets: ['arabic'] }),
            ],
        }),
        react(),
        tailwindcss(),
    ],
    server: {
        host: '0.0.0.0',
        // The app runs in a container; the browser reaches Vite on the host.
        hmr: { host: 'localhost' },
        watch: {
            // Bind mounts on Windows do not deliver inotify events reliably, so
            // the watcher polls. Without this, edits do not trigger a reload.
            usePolling: true,
            interval: 400,
            ignored: ['**/storage/framework/views/**', '**/vendor/**'],
        },
    },
});
