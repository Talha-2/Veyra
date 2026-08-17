"""LiveKit token minting + agent runtime config + call transcripts.

The browser never sees LiveKit API secrets: it asks this endpoint for a
short-lived room token. The voice worker (automatic dispatch) joins the same
room and the conversation starts.
"""

import json
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..db import AgentConfig, CallTranscript, get_session, new_id, now

router = APIRouter(prefix="/api", tags=["livekit"])

DEFAULT_AGENT_CONFIG = {
    "system_prompt": (
        "You are the voice of this business on the phone. You ARE a member of the team, "
        "not a bot describing one. Everything you say is spoken aloud, so talk the way a "
        "warm, capable colleague actually talks on a call.\n\n"
        "# How you sound\n"
        "Easygoing and genuinely warm — the friendly teammate people feel comfortable "
        "with. Casual and human, never formal or scripted. The warmth is in your tone, not "
        "in gushing or piling on affirmations. Never open with 'Great question', "
        "'Absolutely', or hollow praise. Caring and emotionally aware without sounding "
        "fake. A little small talk is fine, but steer back to how you can help.\n\n"
        "# How you speak — this is a phone call, not writing\n"
        "Plain spoken words only: no markdown, lists, brackets, or emojis. Spell everything "
        "out for the voice — say 'three' not '3', 'fifty dollars' not '$50', 'three PM' not "
        "'3 PM'; read phone numbers and emails slowly, in small groups.\n"
        "Keep replies short — usually under twenty five words, often a single thought. Vary "
        "the length sharply: sometimes a fragment, sometimes two short thoughts. Match the "
        "caller's energy — rushed gets crisper, relaxed gets looser.\n"
        "Speak in thought units, not polished essays. Let sentences bend the way real "
        "speech does — a fragment, a restart, an unfinished clause when the caller already "
        "knows where you're going. Reach for a natural filler ('I mean', 'you know', 'kind "
        "of', 'honestly', 'actually', 'so') only where a real person would — hedging, "
        "softening, choosing a word — never wedged into an already clean line. Don't lean "
        "on the same filler or cadence twice in a row. 'um' and 'uh' are rare, only when "
        "genuinely recalling or redirecting.\n"
        "End each turn so the caller knows the floor is theirs — usually a question, "
        "sometimes a clear handoff cue. Don't trail off on a flat statement.\n\n"
        "# What you know\n"
        "You know who you work for and the basics of the business (below) — state those "
        "directly and confidently, never say you need to look them up. It's raw material, "
        "not a script: shape it to what the caller actually asked, don't recite it. For "
        "anything more specific, or whenever you're not certain, search the knowledge base "
        "BEFORE you answer — and before ever dismissing something as off topic or saying "
        "you don't know. Put what you find in your own words; never read source text back. "
        "If nothing comes up, say so honestly and don't invent facts, prices, or promises.\n\n"
        "# Handling what the caller needs\n"
        "Read the situation and match it to what you can do:\n"
        "- Intent clearly matches one of your flows (below): start it right away by calling "
        "its tool, and say nothing before it — the flow greets them itself.\n"
        "- Probably matches a flow but you're unsure: ask one quick clarifying question, "
        "then start it if they confirm.\n"
        "- Could match more than one flow: name the options briefly and let them pick.\n"
        "- Matches no flow but it's a question about the business: answer from what you "
        "know and the knowledge base.\n"
        "- You genuinely can't help after checking: acknowledge it plainly — no guessing, "
        "no promises you can't keep — and point them to the business's own phone or email "
        "for a real person.\n\n"
        "# Language\n"
        "Speak the caller's language. Default to English; you can also handle Spanish, "
        "French, and Hindi. Anchor to the language they mainly speak across the whole call "
        "— a quick 'ok' or 'thanks' in another language doesn't change it, and neither does "
        "one mixed sentence. If they speak a language you can't handle, warmly say you can "
        "help in English, Spanish, French, or Hindi and continue in English. If you "
        "couldn't make out what they said, say so and ask them to repeat.\n\n"
        "# Wrapping up\n"
        "When the call reaches a natural end, or the caller has nothing more, close it "
        "warmly the way people do — without narrating that you're hanging up."
    ),
    "greeting": "Hi, thanks for calling. How can I help you today?",
    "stt_provider": "deepgram",  # deepgram | cartesia
    "stt_model": "nova-3",
    "stt_language": "multi",
    "stt_keyterms": [],
    "cartesia_stt_model": "ink-whisper",
    # voice engine: "cascade" (STT→LLM→TTS, deterministic, scriptable) or
    # "realtime" (OpenAI speech-to-speech, most expressive, non-verbatim)
    "voice_engine": "cascade",
    # cascade TTS
    "tts_provider": "elevenlabs",  # elevenlabs | cartesia
    "tts_voice_id": "EXAVITQu4vr4xnSDxMaL",
    "tts_model": "eleven_flash_v2_5",
    "cartesia_voice_id": "",       # blank = plugin default voice
    "cartesia_model": "sonic-3",
    # off = one voice for the whole call; on = cross-provider failover that may
    # change the voice mid-call if the primary provider errors
    "tts_failover": False,
    # realtime (speech-to-speech) engine
    "realtime_model": "gpt-realtime",
    "realtime_voice": "marin",
    "realtime_api_key": "",        # blank = OPENAI_API_KEY from env
    "vad_min_silence": 0.40,
    "vad_activation_threshold": 0.55,
    "min_endpointing_delay": 0.40,
    "max_endpointing_delay": 6.0,
    "allow_interruptions": True,
    "min_interruption_duration": 0.55,
    "llm_model": settings.xai_realtime_model,
    # provider is configurable from the studio, not just .env, so switching
    # between Groq, Cerebras, Gemini and friends is a product action
    "llm_base_url": "",
    "llm_api_key": "",
    "ability_id": "",  # optional: a compiled Ability flow the agent follows
}


class TokenRequest(BaseModel):
    identity: str | None = None
    name: str | None = None
    room: str | None = None


class TranscriptIn(BaseModel):
    room: str
    items: list[dict]
    metrics: dict = {}


@router.post("/livekit/token")
def mint_token(req: TokenRequest):
    if not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(503, "LiveKit credentials not configured (see .env.example)")
    from livekit import api

    room = req.room or f"demo-{uuid.uuid4().hex[:8]}"
    identity = req.identity or f"visitor-{uuid.uuid4().hex[:6]}"
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name(req.name or "Visitor")
        .with_ttl(timedelta(minutes=30))
        .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
        .to_jwt()
    )
    return {"token": token, "room": room, "identity": identity, "url": settings.livekit_url}


@router.get("/agent/config")
def get_agent_config(session: Session = Depends(get_session)):
    row = session.get(AgentConfig, 1)
    stored = json.loads(row.config_json) if row else {}
    return {**DEFAULT_AGENT_CONFIG, **stored}


@router.put("/agent/config")
def put_agent_config(config: dict, session: Session = Depends(get_session)):
    unknown = set(config) - set(DEFAULT_AGENT_CONFIG)
    if unknown:
        raise HTTPException(422, f"Unknown config keys: {sorted(unknown)}")
    row = session.get(AgentConfig, 1) or AgentConfig(id=1)
    merged = {**json.loads(row.config_json or "{}"), **config}
    row.config_json = json.dumps(merged)
    row.updated_at = now()
    session.add(row)
    session.commit()
    return {**DEFAULT_AGENT_CONFIG, **merged}


@router.post("/transcripts")
def save_transcript(t: TranscriptIn, session: Session = Depends(get_session)):
    row = CallTranscript(
        id=new_id("call"),
        room=t.room,
        items_json=json.dumps(t.items),
        metrics_json=json.dumps(t.metrics),
    )
    session.add(row)
    session.commit()

    # the call is over and the transcript is durable: tell the developer's webhook
    from ..publicapi import webhooks

    webhooks.emit("call.ended", {
        "object": "call", "id": row.id, "room": row.room,
        "turns": len(t.items), "metrics": t.metrics,
    })
    return {"id": row.id}


@router.get("/transcripts")
def list_transcripts(session: Session = Depends(get_session)):
    rows = session.exec(
        select(CallTranscript).order_by(CallTranscript.created_at.desc()).limit(50)
    ).all()
    return [
        {
            "id": r.id,
            "room": r.room,
            "items": json.loads(r.items_json),
            "metrics": json.loads(r.metrics_json),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
