# One-command setup & start (Windows).
#   .\start.ps1          build + start everything
#   .\start.ps1 -Down    stop everything
#   .\start.ps1 -Logs    tail logs
param(
    [switch]$Down,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if ($Down) { docker compose down; exit $LASTEXITCODE }
if ($Logs) { docker compose logs -f; exit $LASTEXITCODE }

docker info *> $null
if (-not $?) {
    Write-Host "Docker is not running. Start Docker Desktop and re-run." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "Created .env from .env.example." -ForegroundColor Yellow
    Write-Host "Fill in your keys (LIVEKIT_*, DEEPGRAM_API_KEY, ELEVEN_API_KEY, XAI_API_KEY), then re-run .\start.ps1" -ForegroundColor Yellow
    exit 1
}

# warn (don't block) on missing keys — the stack still boots, calls just won't connect
$envText = Get-Content ".env" -Raw
foreach ($key in "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "DEEPGRAM_API_KEY", "ELEVEN_API_KEY", "XAI_API_KEY") {
    if ($envText -match "(?m)^$key=\s*$") {
        Write-Host "warning: $key is empty in .env" -ForegroundColor Yellow
    }
}

docker compose up --build -d
if (-not $?) { exit 1 }

Write-Host ""
Write-Host "RelayVoice is up:" -ForegroundColor Green
Write-Host "  Landing + live demo   http://localhost:3000"
Write-Host "  Studio                http://localhost:3000/studio"
Write-Host "  API                   http://localhost:8000/docs"
Write-Host ""
Write-Host "Logs: .\start.ps1 -Logs    Stop: .\start.ps1 -Down"
