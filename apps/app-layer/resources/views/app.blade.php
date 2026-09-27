<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title inertia>{{ config('app.name', 'Veyra') }}</title>

    {{-- Resolve the theme before first paint. Without this the page renders on
         the light default and repaints to dark, which on a near-black system is
         a full-screen flash on every navigation. --}}
    <script>
        (function () {
            try {
                var stored = localStorage.getItem('veyra-theme');
                var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
            } catch (e) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();
    </script>

    {{-- Vite::fonts() is required, and its absence is silent.
         The fonts plugin emits a separate fonts.css plus fonts-manifest.json;
         @vite does not include them, so without this line no @font-face rule
         ever loads and the whole interface quietly renders in system fallbacks
         — Segoe UI standing in for Inter, and a Naskh face for Urdu. It still
         looks plausible, which is why it went unnoticed. --}}
    <link rel="preload" href="/fonts/poppins/poppins-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/poppins/poppins-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
    {{ Vite::fonts() }}
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    @inertiaHead
</head>
<body>
    @inertia
</body>
</html>
