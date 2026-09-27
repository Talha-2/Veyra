#!/bin/sh
# Boot the app layer in production: settle config from the host's environment,
# migrate, optionally load the demo data once, then serve on $PORT.
set -e

# Render's `generateValue` produces a base64-encoded 256-bit value without
# Laravel's "base64:" prefix; add it so the key decodes to the 32 bytes the
# cipher needs. A key that already has the prefix is left alone.
case "${APP_KEY:-}" in
  "") echo "APP_KEY is not set" >&2; exit 1 ;;
  base64:*) ;;
  *) export APP_KEY="base64:${APP_KEY}" ;;
esac

# Render sets RENDER_EXTERNAL_URL to the service's public https address.
export APP_URL="${APP_URL:-${RENDER_EXTERNAL_URL:-http://localhost:${PORT}}}"

php artisan migrate --force --no-interaction

# Opt-in: the demo organization (Northwind) with its sample calls, inbox and
# skills, loaded only into an empty database. Sign in as owner@veyra.test with
# the DEMO_PASSWORD you set; without one the command refuses to seed.
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  php artisan veyra:seed-demo --no-interaction
fi

exec php artisan serve --host=0.0.0.0 --port="${PORT}" --no-reload
