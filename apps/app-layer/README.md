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

## Public API

For customers who integrate Veyra into their own platform instead of (or as
well as) using Desk. **Not** the agent contract (`/api/agent/v1`,
`docs/agent-contract.md`), which is untouched by it.

- **Routes:** `routes/api_v1.php`, mounted at `/api/v1`. Controllers in
  `app/Http/Controllers/Api/V1/`, objects in `app/Http/Resources/V1/`.
  Contacts (CRUD + lookup by phone/email), conversations (+ messages, notes),
  messages (record outbound / add notes), tickets (+ notes), leads (+ move
  stage), pipelines, calls (+ transcript, summary, handoffs), knowledge
  documents (+ search) and webhook endpoints, plus `GET /me`.
- **Auth:** `Authorization: Bearer vy_sk_…`, minted in Studio › Developer.
  `AuthenticateApiKey` finds the key by its SHA-256 hash, sets its
  organization as the tenant (so TenantScope confines everything, route
  binding included), rate-limits 120/min per key with `X-RateLimit-*`
  headers, and checks the route's scope. Every route declares
  `->apiScope('tickets:read')` (or `null` = any key); a route without one is
  refused at runtime. Scopes are `ApiKey::SCOPES`.
- **Publishable keys** (`vy_pk_…`) only reach routes marked `->publishable()`:
  `GET /me`, `POST /knowledge/search` and the agent chat routes, and may only
  hold `knowledge:read` and `chat:write`.
- **Agent chat** (`/api/v1/chat/sessions`, scope `chat:write`): a site or
  backend talks to the customer-facing agent through `App\Services\Agent\LiveChat`,
  the same service as Studio Talk's chat. A session is one visitor's web-chat
  conversation in Desk (`visitor.id` → identifier `api:{id}`; email/phone link
  an existing contact). `POST …/{id}/messages` waits for the reply (JSON with
  `reply` and the agent's `steps`) or streams it (`"stream": true` / `Accept:
  text/event-stream`, ending with a `message` event). Publishable keys must
  send the session's `session_token` (an HMAC of the conversation id, returned
  once at creation) as `X-Chat-Session-Token`.
- **Shape:** single objects unwrapped, with `object`, numeric `id`,
  `created_at`/`updated_at` in ISO 8601 UTC; lists are
  `{object: "list", data, has_more, next_cursor}` (`?limit`, `?cursor`,
  `?updated_since`); errors are `{error: {type, message, fields?}}`
  (`App\Support\PublicApi\ApiError`, wired in `bootstrap/app.php`).
- **Outbound messages are recorded, not sent:** no SMS/email provider is
  connected, so they are created `status: "queued"` and stay queued.
- **Spec:** `App\Support\PublicApi\OpenApiSpec` (hand-maintained, OpenAPI
  3.1), served at `GET /api/v1/openapi.json`, rendered in Studio › Developer
  and publicly at `/docs/api`. `PublicApiTest` fails if a route and the spec
  disagree, so add both together.
- **Webhooks:** `App\Observers\WebhookObserver` (registered in
  `AppServiceProvider`) turns model changes into events — whichever surface
  made them — and `App\Services\Webhooks\WebhookDispatcher` delivers them
  **after the response** with `defer()` (there is no queue worker in
  production), 5 s timeout, one retry on 5xx/429/fast refusal, every attempt
  a `WebhookDelivery` row. Signed `X-Veyra-Signature: sha256=<hmac of the raw
  body>`, plus `X-Veyra-Event` and `X-Veyra-Delivery`. An endpoint is turned
  off after 10 consecutive failed events (`WEBHOOK_DISABLE_AFTER`); switching
  it back on in Studio resets it. Private/loopback URLs are refused unless
  `APP_ENV=local` (`WEBHOOK_ALLOW_PRIVATE_URLS`). Settings: `config/public_api.php`.

```bash
curl http://localhost:8080/api/v1/me -H "Authorization: Bearer $VEYRA_API_KEY"
```

## Deploying (Render + Neon)

The app layer and the agent gateway run on Render's free plan from the
blueprint at the repo root (`render.yaml`); Postgres runs on Neon's free plan.
The company website stays on Vercel.

1. **Neon:** create a project in AWS US East 2 (Ohio), next to the Render
   services. Copy the connection string with **connection pooling turned
   off** (the direct one): `postgresql://…@ep-….us-east-2.aws.neon.tech/neondb?sslmode=require`.
2. **Render:** New → Blueprint → pick this GitHub repo and the `main` branch.
   Render reads `render.yaml` and asks for the `sync: false` values:
   - `DB_URL`: the Neon string from step 1.
   - `COMPOSIO_API_KEY`, `CARTESIA_API_KEY`, `OPENAI_API_KEY`,
     `DEEPGRAM_API_KEY`, `LANGFUSE_*`: from your root `.env` (any you leave
     blank just switches that feature to its "not configured" state).
   - `AGENT_GATEWAY_URL` and `APP_LAYER_URL`: leave them for step 3; the
     services' addresses do not exist yet.
   - `DEMO_PASSWORD`: only if you want the demo workspace (see below).
   `APP_KEY` and `AGENT_SHARED_SECRET` are generated by Render; the gateway
   reads the secret from the app service, so the two always match.
3. **Wire the two services together** once both have deployed: on
   `veyra-app` set `AGENT_GATEWAY_URL` to veyra-agent's URL
   (`https://veyra-agent….onrender.com`); on `veyra-agent` set
   `APP_LAYER_URL` to veyra-app's URL. Each redeploys on save.
4. **Vercel:** in the website project set `NEXT_PUBLIC_APP_URL` to
   veyra-app's URL and redeploy. Sign in, Get started and the contact forms
   then go to the deployed app.

**Demo workspace (optional).** Set `SEED_DEMO_DATA=true` and a `DEMO_PASSWORD`
of 12+ characters on `veyra-app`. On its next start, into an empty database
only, it loads Northwind (sample calls, inbox, skills) with owner@veyra.test,
operator@veyra.test and builder@veyra.test, all using `DEMO_PASSWORD`. It
refuses to seed without one, because the seeder's own password is
`password`. Without the demo, register at `/register` and create an
organization.

**What the free plan means in practice**
- Each service sleeps after about 15 minutes without traffic; the next visit
  waits 30–60 s while it wakes. The first Ask after the gateway has slept
  can show "agent layer offline" until it is up.
- The disk is wiped on every deploy and restart, so uploaded knowledge files
  do not survive (their text is in Postgres, the original files are not).
  Move `FILESYSTEM_DISK` to S3 before relying on uploads.
- The gateway's automation claim loop only runs while it is awake.
- The production image (`docker/Dockerfile.prod`) runs migrations on every
  start (`docker/start-prod.sh`), serves with `artisan serve` and 4 forked
  workers, and logs to stderr (Render's log tab). It trusts the proxy's
  `X-Forwarded-*` headers (`bootstrap/app.php`), which is what keeps asset
  URLs on https.

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
