# Veyra app layer

Laravel 13 + Inertia + React 19 + PostgreSQL. Owns all customer data, both
product surfaces, auth and tenancy. It never runs AI — that is the agent layer's
job, reached over HTTP. See [ARCHITECTURE.md](../../ARCHITECTURE.md).

Two products live here and are kept apart on purpose:

| | route | pages | layout | gate |
|---|---|---|---|---|
| **Veyra Desk** | `/desk/*` | `resources/js/pages/desk/` | `desk-layout.tsx` | `access-desk` |
| **Veyra Studio** | `/studio/*` | `resources/js/pages/studio/` | `studio-layout.tsx` | `access-studio` |

A user can hold one without the other. Neither sidebar ever lists the other's
pages; `components/app-switcher.tsx` is the only crossing point.

## Running it

```bash
docker compose up -d                                   # app + postgres
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate --seed
npm install && npm run dev                             # Vite runs on the HOST
```

Then http://localhost:8080.

Vite deliberately runs on the host rather than in the container: a watcher
inside a Windows bind mount has to poll, which is slow and misses changes.

### Seeded accounts

All use password `password`. Each one exercises a different branch of the access
rules, so signing in as all three is a full manual test of the surface split.

| Email | Role | Sees |
|---|---|---|
| `owner@veyra.test` | Owner | Desk + Studio, two organizations |
| `operator@veyra.test` | Member | Desk only — no app switcher at all |
| `builder@veyra.test` | Admin | Studio only — Desk explicitly revoked |

## Tests

```bash
docker compose exec app php artisan test
npx tsc --noEmit        # type-check the frontend
```

Tests run on in-memory SQLite and do not need Postgres.

## Things that will bite you

**Never put `DB_*` in `docker-compose.yml`.** A variable set on the container
lands in `$_SERVER`, and Laravel's `Env` repository reads `$_SERVER` before
`$_ENV`. PHPUnit's `<env>` only writes `$_ENV` and `putenv()`, so container-set
`DB_*` silently beats `phpunit.xml` *even with `force="true"`* — the suite then
runs against the development database and `RefreshDatabase` truncates it on
every run. The failure is silent: seeded data just disappears. DB config lives
in `.env` only.

**One `stat()` costs ~4.5 ms on this bind mount, and PHP edits are invisible
until you restart.** Measured 2026-09-27: 300 stats = 1,350 ms. A request
includes ~500 files, so opcache's timestamp validation alone (`validate_timestamps=1`,
which re-stats every cached file) cost 2–6 s per request — even with opcache
otherwise working. The greeting-path route took 6 s. Two things fix it:

- `docker/php.ini` sets `opcache.validate_timestamps = 0`, so cached files are
  served from memory with no stat. **A PHP source edit is not picked up until
  `docker compose restart app`** (about 5 s). When iterating on PHP, put
  `OPCACHE_VALIDATE_TIMESTAMPS=1` in `.env` and restart once; the entrypoint
  writes it into `zz-runtime.ini`. Expect slow requests while it is on.
- The Composer classmap is optimized (`dump-autoload -o`), so autoload misses
  do not probe the disk. Re-run it after adding classes in new namespaces:
  `MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/app" -w /app composer:2 dump-autoload -o`.

With both, a contract route answers in ~250–400 ms from the host — the rest is
Docker Desktop's network path, and disappears on a Linux host without a bind
mount. Measure the server from inside the container (`curl` at `:8000`), not
through a browser, when timing is in doubt: Chrome's parallel connections stall
the built-in server and made it look 10× slower than it was.

**`--no-reload` is required** for `PHP_CLI_SERVER_WORKERS` to take effect —
Laravel refuses to fork while watching `.env`. The trade: editing `.env` needs
`docker compose restart app` (as do PHP edits — see above).

**Shared Inertia props that depend on the tenant must be closures.** Inertia
calls `share()` on the way *in*, before route middleware, so `HandleInertiaRequests`
runs before `SetCurrentOrganization` has resolved the tenant. Anything computed
eagerly reads a null tenant on the first request after sign-in.

**Tenant middleware must outrank route-model binding.** `SubstituteBindings`
lives in the `web` group and resolves `{document}` *before* the route's own
`tenant` middleware has put the organization in the session. On the first
request after sign-in that meant a 404 on any deep link over HTTP — and, under
PHPUnit, a cross-tenant read, because the test runner is a console process and
`TenantScope` used to skip filtering there. Both are fixed in `bootstrap/app.php`
(priority list) and `TenantScope` (fails closed under `runningUnitTests()`).
If you add a middleware that needs the tenant before binding, add it to the
priority list too.

**Tests run on SQLite, dev runs on Postgres.** Anything Postgres-only —
`ilike`, `~` regex, `jsonb` operators, `FOR UPDATE` — passes the browser sweep
and fails the suite, or the reverse. Write portable SQL (`lower(col) like ?`),
or gate the dialect explicitly and test both branches.

**`#[Fillable]` drops unknown keys silently.** `$model->update(['revoked_at' =>
now()])` on a model whose fillable list lacks `revoked_at` is a no-op with no
error. State transitions belong in a named model method that uses `forceFill`
(`ApiKey::revoke()`, `Document::reindex()`), which is also where the test goes.

**The agent layer runs as the `agent` compose service.** `docker compose up
-d agent` builds and starts the gateway; set `AGENT_GATEWAY_URL=http://agent:8100`
in `.env` and `docker compose restart app`. (Running it on the host instead
still works: `AGENT_GATEWAY_URL=http://host.docker.internal:8100` and
`python -m veyra_gateway` from `apps/agent-layer` with
`APP_LAYER_URL=http://127.0.0.1:8080` and the same secret.) The Ask page
streams through it token by token (`POST /studio/ask/stream`, an SSE relay in
`AskController`); the Ask page, the automations' "Run now" and the skills' "Try it" go live the
moment it answers `/v1/health`; without it they say so rather than pretend.
`AgentGateway` reads its config at call time, so the feature tests switch the
gateway on with `config()` and `Http::fake()` — never a real one.

**The company website's form posts here.** `POST /api/site/inquiries`
(public, throttled 6/min per IP, honeypot field `website`, CORS from Laravel's
default `api/*` config) stores a `SiteInquiry` (not tenant data; IP kept only
as an HMAC). Nothing reads them in the UI yet: `SiteInquiry::latest()->get()`
in tinker.

**Provider keys the app layer itself uses** (all optional; each page says
which mode it is in):

| Key | Used by | Without it |
|---|---|---|
| `COMPOSIO_API_KEY` | Studio › Integrations catalog: live toolkits, tools, OAuth connect | curated list; connections recorded as stubs |
| `CARTESIA_API_KEY` | Studio › Voice: live voice list and previews (Sonic) | curated voices, no previews |
| `ELEVENLABS_API_KEY` | same, for ElevenLabs voices | ElevenLabs absent from the engine list |
| `GOOGLE_CLIENT_ID/SECRET` | Composio auth configs for Google toolkits that offer no managed login | those toolkits refuse to connect, with the reason |

The root `.env`'s keys were probed on 2026-09-27: Composio, Cartesia,
Deepgram, Groq, OpenAI, Langfuse and LiveKit work; **xAI (403) and ElevenLabs
(401) are dead**, and the Groq model name it carried had been retired. The
Models section on Studio › Identity verifies each key live and says "key
rejected" rather than listing a provider that cannot answer. Cartesia lists
Urdu-tagged voices but rejects `language=ur` on every model, so Urdu stays on
Azure; the voice list filters those voices out rather than offering a
preview that 502s.

**Composer installs truncate on this network.** `curl error 56` mid-download. Use
a persistent cache and serialize transfers so retries resume rather than restart:

```bash
docker run --rm -v "$PWD:/app" -v "<cache>:/tmp/ccache" -w /app \
  -e COMPOSER_HOME=/tmp/ccache -e COMPOSER_MAX_PARALLEL_HTTP=1 \
  composer:2 install --prefer-dist --no-scripts
```

## Layout

```
app/
├── Enums/Surface.php            the two products, named once
├── Enums/OrganizationRole.php   role -> default surfaces
├── Models/{Organization,Membership,User}.php
├── Scopes/TenantScope.php       fails closed over HTTP
├── Traits/BelongsToTenant.php   scope + auto-stamp organization_id
├── Http/Middleware/
│   ├── SetCurrentOrganization.php   resolves the tenant, re-checks membership
│   ├── EnsureSurfaceAccess.php      redirects rather than 403s on GET
│   └── HandleInertiaRequests.php
└── Providers/TenancyServiceProvider.php   $table->organization() + the gates

routes/
├── web.php        auth, onboarding, org switch, root redirect
├── desk/          loaded under /desk behind surface:desk
└── studio/        loaded under /studio behind surface:studio
```

Route files in `routes/desk/` and `routes/studio/` are globbed in
`bootstrap/app.php` and inherit their surface's prefix, name prefix and gate, so
an individual file cannot be reachable from the wrong surface.
