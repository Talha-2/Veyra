import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_here = Path(__file__).resolve()
try:
    REPO_ROOT = _here.parents[3]  # <repo>/apps/server/app/config.py
except IndexError:
    REPO_ROOT = _here.parent  # shallow layout (e.g. /app in a container)
DATA_DIR = Path(os.getenv("DATA_DIR", str(REPO_ROOT / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path(".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LiveKit
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # Providers
    xai_api_key: str = ""
    xai_realtime_model: str = "grok-3-mini"
    xai_agent_model: str = "grok-4"
    xai_judge_model: str = "grok-4"

    # Storage
    sqlite_path: str = str(DATA_DIR / "voiceagent.db")
    lancedb_path: str = str(DATA_DIR / "lancedb")
    upload_dir: str = str(DATA_DIR / "uploads")

    # RAG
    embedding_model: str = "BAAI/bge-small-en-v1.5"  # 384-dim, ONNX, runs locally
    chunk_size_tokens: int = 400
    chunk_overlap_tokens: int = 60
    retrieval_top_k: int = 6

    server_host: str = "127.0.0.1"
    server_port: int = 8000

    # Auth
    auth_secret: str = "dev-insecure-change-me"  # sign JWTs; override in prod
    dev_mode: bool = True  # when true, OTP/reset codes are returned in API responses
    jwt_ttl_hours: int = 720  # 30 days
    frontend_url: str = "http://localhost:3000"

    # Google OAuth (stubbed until these are set)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""  # e.g. http://localhost:8000/api/auth/google/callback

    # Composio — integrations/tools for the voice agent (free tier at composio.dev).
    # The integrations feature stays inactive (stub) until this is set.
    composio_api_key: str = ""

    # ElevenLabs — powers TTS + the voice testing bench (preview / A-B compare).
    eleven_api_key: str = ""

    # Where developers reach this deployment. Used as the `servers` entry in the
    # public OpenAPI spec and in every code snippet the Developers page renders.
    public_base_url: str = "http://localhost:8000"


settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
