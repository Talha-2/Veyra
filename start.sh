#!/usr/bin/env bash
# One-command setup & start (macOS/Linux).
#   ./start.sh          build + start everything
#   ./start.sh down     stop everything
#   ./start.sh logs     tail logs
set -euo pipefail
cd "$(dirname "$0")"

case "${1:-}" in
  down) docker compose down; exit ;;
  logs) docker compose logs -f; exit ;;
esac

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start it and re-run." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo
  echo "Created .env from .env.example."
  echo "Fill in your keys (LIVEKIT_*, DEEPGRAM_API_KEY, ELEVEN_API_KEY, XAI_API_KEY), then re-run ./start.sh"
  exit 1
fi

for key in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET DEEPGRAM_API_KEY ELEVEN_API_KEY XAI_API_KEY; do
  if grep -Eq "^${key}=\s*$" .env; then
    echo "warning: ${key} is empty in .env"
  fi
done

docker compose up --build -d

echo
echo "RelayVoice is up:"
echo "  Landing + live demo   http://localhost:3000"
echo "  Studio                http://localhost:3000/studio"
echo "  API                   http://localhost:8000/docs"
echo
echo "Logs: ./start.sh logs    Stop: ./start.sh down"
