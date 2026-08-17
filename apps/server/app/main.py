from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .experts.scheduler import start_scheduler
from .routers import (
    abilities,
    business,
    agent_chat,
    auth,
    desk,
    desk_email,
    developer,
    evals,
    experts,
    integrations,
    knowledge,
    livekit_routes,
    public_api,
    telephony,
    voice_lab,
    workflows,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()  # background loop for scheduled Experts
    yield


app = FastAPI(title="Voice Agent Platform API", version="0.1.0", lifespan=lifespan)

import os

_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(abilities.router)
app.include_router(business.router)
app.include_router(auth.router)
app.include_router(experts.router)
app.include_router(integrations.router)
app.include_router(knowledge.router)
app.include_router(workflows.router)
app.include_router(livekit_routes.router)
app.include_router(voice_lab.router)
app.include_router(developer.router)
app.include_router(public_api.router)
app.include_router(agent_chat.router)
app.include_router(evals.router)
app.include_router(telephony.router)
app.include_router(desk.router)
app.include_router(desk_email.router)


@app.get("/api/health")
def health():
    return {"ok": True}
