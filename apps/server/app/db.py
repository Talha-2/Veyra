"""SQLite (via SQLModel) holds documents, folders, workflows, agent config,
transcripts, and eval runs. Vectors live in LanceDB (see rag/store.py)."""

import json
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class Folder(SQLModel, table=True):
    """A knowledge-base folder. parent_id=None means it lives at the root.
    Folders are pure organization — retrieval ignores them; every document is
    chunked and searchable regardless of where it sits."""

    id: str = Field(primary_key=True)
    name: str
    parent_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Document(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    source_type: str  # "upload" | "created" | "agent" | "scrape"
    mime: str = "text/plain"
    size_bytes: int = 0
    n_chunks: int = 0
    status: str = "processing"  # processing | ready | error
    error: str | None = None
    content: str = ""  # extracted markdown/plain text — the source of truth for RAG
    content_rich: str = ""  # HTML from the rich editor, for re-editing (derived from content if empty)
    folder_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Workflow(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    description: str = ""
    enabled: bool = True
    spec_json: str = "{}"  # validated against workflows/schema.py
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)

    @property
    def spec(self) -> dict:
        return json.loads(self.spec_json)


class AgentConfig(SQLModel, table=True):
    """Single-row table: the studio 'tuning' page writes here, the voice
    worker reads it at session start."""

    id: int = Field(default=1, primary_key=True)
    config_json: str = "{}"
    updated_at: datetime = Field(default_factory=now)


class BusinessProfile(SQLModel, table=True):
    """Single-row table: who the agent works for.

    This is deliberately separate from the knowledge base. The profile is
    facts the agent must ALWAYS have in hand (name, hours, timezone), so it
    is injected into the system prompt on every call. The knowledge base is
    material the agent looks up on demand via the search tool. Preloading
    documents instead would burn context and, worse, drift the persona
    toward whatever happens to be uploaded."""

    id: int = Field(default=1, primary_key=True)
    profile_json: str = "{}"
    updated_at: datetime = Field(default_factory=now)


class DeepAgentThread(SQLModel, table=True):
    """A deep-agent conversation, for the sidebar. The agent's working state
    (todos, files) lives in the LangGraph checkpointer keyed by this id; here we
    keep the human-readable message history so the sidebar can list and reopen it."""

    id: str = Field(primary_key=True)
    title: str = ""
    messages_json: str = "[]"  # [{role, content}]
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class CallTranscript(SQLModel, table=True):
    id: str = Field(primary_key=True)
    room: str
    items_json: str = "[]"  # [{role, text, ts}]
    metrics_json: str = "{}"  # latency aggregates reported by the worker
    created_at: datetime = Field(default_factory=now)


# ── Telephony ────────────────────────────────────────────────────────────────
# Real phone numbers, calls, and SMS, provider-agnostic. The active provider
# (Twilio to start) is resolved from TelephonyConfig at runtime; every row keeps
# the provider + its foreign id so a workspace can hold numbers across providers.


class TelephonyConfig(SQLModel, table=True):
    """Single-row table: which provider is active and its credentials.

    Kept in the DB (not just .env) so telephony can be turned on from the studio
    by pasting keys, the same way AgentConfig drives the voice worker. `config_json`
    holds the provider secrets (account sid, auth token, messaging service, …);
    `livekit_json` caches the LiveKit SIP trunk ids we provision so we create them
    once, not per call."""

    id: int = Field(default=1, primary_key=True)
    provider: str = "twilio"  # twilio | telnyx | signalwire (only twilio wired today)
    config_json: str = "{}"
    livekit_json: str = "{}"  # {outbound_trunk_id, inbound_trunk_id, dispatch_rule_id}
    updated_at: datetime = Field(default_factory=now)


class PhoneNumber(SQLModel, table=True):
    """A number the workspace owns, provisioned through a provider."""

    id: str = Field(primary_key=True)  # pn_...
    e164: str = Field(index=True)  # +14155552671
    friendly_name: str = ""
    country: str = "US"  # ISO-3166 alpha-2
    provider: str = "twilio"
    provider_sid: str = ""  # e.g. Twilio PN... — the handle for release/config
    capabilities_json: str = "{}"  # {"voice": true, "sms": true, "mms": true}
    # inbound routing: which flow answers a call, and whether SMS auto-replies
    inbound_agent: str = "default"  # "default" (the tuned voice agent) or an ability id
    sms_autoreply: bool = False
    # who receives calls to this number: "" / "ai" = the AI agent answers;
    # a TeamMember id = ring that person (the agent can screen then transfer).
    assigned_to: str = ""
    # IVR menu config: {"enabled": bool, "greeting": str,
    #   "options": [{"key":"1","label":"Sales","action":"agent|external|extension|ai|voicemail","target":"..."}],
    #   "no_input": {"action":..., "target":...}}
    ivr_json: str = "{}"
    status: str = "active"  # active | releasing | released
    monthly_cost: str = ""  # what the provider quoted, for the UI
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Call(SQLModel, table=True):
    """One phone call, inbound or outbound. Links to a LiveKit room (and thus a
    CallTranscript) when the agent handled it."""

    id: str = Field(primary_key=True)  # cl_...
    direction: str = "outbound"  # inbound | outbound
    from_number: str = ""
    to_number: str = ""
    number_id: str | None = Field(default=None, index=True)  # our PhoneNumber.id
    provider: str = "twilio"
    provider_sid: str = ""  # provider's call id (CA... on Twilio)
    room: str | None = None  # LiveKit room, links to CallTranscript.room
    status: str = "queued"  # queued|ringing|in-progress|completed|failed|no-answer|busy|canceled
    duration_sec: int = 0
    recording_url: str = ""
    error: str | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class SmsMessage(SQLModel, table=True):
    """One SMS/MMS, inbound or outbound. Threads are grouped in the API by the
    counterparty number (the other end of the conversation)."""

    id: str = Field(primary_key=True)  # sm_...
    direction: str = "outbound"  # inbound | outbound
    from_number: str = ""
    to_number: str = ""
    number_id: str | None = Field(default=None, index=True)  # our PhoneNumber.id
    counterparty: str = Field(default="", index=True)  # the other party's number (thread key)
    provider: str = "twilio"
    provider_sid: str = ""
    body: str = ""
    status: str = "queued"  # queued|sent|delivered|received|failed|undelivered
    error: str | None = None
    created_at: datetime = Field(default_factory=now)


# ── Vera Desk (client CRM) ───────────────────────────────────────────────────
# The simplified, client-facing product on top of the same data the technical
# platform runs on. Its inbox reads the real telephony Calls and SmsMessages;
# Contacts (leads) auto-populate from that activity and from public form/ad
# intake, and move through pipeline stages. Nothing here is a separate silo —
# it is a clean view over what Vera is already doing.

CONTACT_STAGES = ["new", "open", "qualified", "won", "lost"]
TICKET_STATUSES = ["open", "in_progress", "pending", "testing", "resolved", "closed"]


class Contact(SQLModel, table=True):
    """A person in the CRM: a lead, prospect, or customer. Auto-created for every
    phone number that calls or texts, and via the public lead intake endpoint."""

    id: str = Field(primary_key=True)  # ct_...
    name: str = ""
    phone: str = Field(default="", index=True)  # e164, links to telephony activity
    email: str = Field(default="", index=True)
    company: str = ""
    stage: str = "new"  # new | open | qualified | won | lost
    source: str = "manual"  # call | sms | form | ad | manual | import
    owner: str = ""  # who on the team owns this relationship
    value: int = 0  # deal value, whole units of currency
    notes: str = ""
    tags_json: str = "[]"
    last_contact_at: datetime | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Ticket(SQLModel, table=True):
    """A support or follow up item, optionally tied to a Contact and a channel."""

    id: str = Field(primary_key=True)  # tk_...
    subject: str = ""
    body: str = ""
    status: str = "open"  # open | in_progress | pending | testing | resolved | closed
    priority: str = "normal"  # low | normal | high | urgent
    type: str = ""  # a category tag, e.g. "Appointment Update", "Billing", "Medication"
    contact_id: str | None = Field(default=None, index=True)
    channel: str = "manual"  # call | sms | email | form | manual
    assignee: str = ""  # legacy single assignee; assignee_ids is the multi version
    assignee_ids_json: str = "[]"  # TeamMember ids
    creator: str = "You"
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


LEAD_SOURCES = ["Manual", "Meta Ads", "Google Ads", "Organic Website", "External Clinics", "Referral", "Import"]


class TeamMember(SQLModel, table=True):
    """A person on the team, used for assignee stacks, creators, and as a call
    transfer target (their direct phone and internal extension)."""

    id: str = Field(primary_key=True)  # tm_...
    name: str = ""
    initials: str = ""
    color: str = "#2563eb"  # avatar background
    role: str = "agent"  # admin | agent | ai
    phone: str = ""  # e164 direct line, used for call transfers
    extension: str = ""  # internal extension, e.g. "101"
    created_at: datetime = Field(default_factory=now)


class Pipeline(SQLModel, table=True):
    """A named lead pipeline with an ordered list of coloured stages."""

    id: str = Field(primary_key=True)  # pl_...
    name: str = ""
    stages_json: str = "[]"  # [{"name": "New", "color": "#..."}]
    is_default: bool = False
    created_at: datetime = Field(default_factory=now)

    @property
    def stages(self) -> list:
        return json.loads(self.stages_json or "[]")


class Lead(SQLModel, table=True):
    """A contact placed in a pipeline and moving through its stages. Kept separate
    from Contact so a person can exist without being an active lead (mirroring how
    a CRM shows thousands of contacts but far fewer live leads)."""

    id: str = Field(primary_key=True)  # ld_...
    contact_id: str = Field(index=True)
    pipeline_id: str = ""
    stage: str = ""
    source: str = "Manual"
    assignee_ids_json: str = "[]"
    next_response_at: datetime | None = None
    outreach_note: str = ""  # "Next response in 12h" / "No proactive outreach…"
    value: int = 0
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Note(SQLModel, table=True):
    id: str = Field(primary_key=True)  # nt_...
    contact_id: str = Field(index=True)
    body: str = ""
    author: str = "You"
    created_at: datetime = Field(default_factory=now)


class Reminder(SQLModel, table=True):
    id: str = Field(primary_key=True)  # rm_...
    contact_id: str = Field(index=True)
    text: str = ""
    due_at: datetime | None = None
    done: bool = False
    created_at: datetime = Field(default_factory=now)


class Conversation(SQLModel, table=True):
    """Assignment + status metadata for an inbox thread. The thread itself is
    derived from telephony Calls and SmsMessages keyed by the external number
    (peer); this row hangs the team side of it: who owns it and whether it is
    open, snoozed, or closed. Upserted lazily as conversations appear."""

    id: str = Field(primary_key=True)  # cv_...
    peer: str = Field(index=True)  # external phone number (thread key)
    contact_id: str | None = Field(default=None, index=True)
    assignee_ids_json: str = "[]"
    status: str = "open"  # open | snoozed | closed
    last_at: datetime | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class EvalRun(SQLModel, table=True):
    id: str = Field(primary_key=True)
    status: str = "running"  # running | done | error
    scenario: str = ""
    persona: str = ""
    turns_json: str = "[]"
    scores_json: str = "{}"
    latency_json: str = "{}"
    error: str | None = None
    created_at: datetime = Field(default_factory=now)


engine = create_engine(
    f"sqlite:///{settings.sqlite_path}", connect_args={"check_same_thread": False}
)


def _migrate() -> None:
    """Add columns introduced after a DB was first created. SQLModel's
    create_all() makes missing *tables* but never alters existing ones, so an
    older voiceagent.db (from the mounted volume) lacks the folder columns.
    SQLite ADD COLUMN is cheap and idempotent-guarded here."""
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(document)"))}
        if "folder_id" not in cols:
            conn.execute(text("ALTER TABLE document ADD COLUMN folder_id VARCHAR"))
        if "content_rich" not in cols:
            conn.execute(text("ALTER TABLE document ADD COLUMN content_rich VARCHAR DEFAULT ''"))
        # ability.triggers_json (added with the workflow trigger system)
        acols = {row[1] for row in conn.execute(text("PRAGMA table_info(ability)"))}
        if acols and "triggers_json" not in acols:
            conn.execute(text("ALTER TABLE ability ADD COLUMN triggers_json VARCHAR DEFAULT '[]'"))
        # ability.global_prompt (added with the pathway model)
        if acols and "global_prompt" not in acols:
            conn.execute(text("ALTER TABLE ability ADD COLUMN global_prompt VARCHAR DEFAULT ''"))
        # expert.trigger_meta_json (added when triggers became named objects)
        ecols = {row[1] for row in conn.execute(text("PRAGMA table_info(expert)"))}
        if ecols and "trigger_meta_json" not in ecols:
            conn.execute(text("ALTER TABLE expert ADD COLUMN trigger_meta_json VARCHAR DEFAULT '{}'"))
        if ecols and "app_trigger_json" not in ecols:
            conn.execute(text("ALTER TABLE expert ADD COLUMN app_trigger_json VARCHAR DEFAULT '{}'"))
        if ecols and "app_trigger_instance" not in ecols:
            conn.execute(text("ALTER TABLE expert ADD COLUMN app_trigger_instance VARCHAR DEFAULT ''"))
        # ability.live_version (added with deploy + version history)
        if acols and "live_version" not in acols:
            conn.execute(text("ALTER TABLE ability ADD COLUMN live_version INTEGER DEFAULT 0"))
        # ticket columns added with the CRM v2 (type, multi assignee, creator)
        tcols = {row[1] for row in conn.execute(text("PRAGMA table_info(ticket)"))}
        if tcols:
            for col, ddl in [
                ("type", "VARCHAR DEFAULT ''"),
                ("assignee_ids_json", "VARCHAR DEFAULT '[]'"),
                ("creator", "VARCHAR DEFAULT 'You'"),
            ]:
                if col not in tcols:
                    conn.execute(text(f"ALTER TABLE ticket ADD COLUMN {col} {ddl}"))
        # telephony routing: number assignment + IVR, team member phone + extension
        pcols = {row[1] for row in conn.execute(text("PRAGMA table_info(phonenumber)"))}
        if pcols:
            if "assigned_to" not in pcols:
                conn.execute(text("ALTER TABLE phonenumber ADD COLUMN assigned_to VARCHAR DEFAULT ''"))
            if "ivr_json" not in pcols:
                conn.execute(text("ALTER TABLE phonenumber ADD COLUMN ivr_json VARCHAR DEFAULT '{}'"))
        mcols = {row[1] for row in conn.execute(text("PRAGMA table_info(teammember)"))}
        if mcols:
            if "phone" not in mcols:
                conn.execute(text("ALTER TABLE teammember ADD COLUMN phone VARCHAR DEFAULT ''"))
            if "extension" not in mcols:
                conn.execute(text("ALTER TABLE teammember ADD COLUMN extension VARCHAR DEFAULT ''"))
                # give existing members a demo extension so transfers have targets
                conn.execute(text(
                    "UPDATE teammember SET extension = CAST(100 + rowid AS TEXT) "
                    "WHERE (extension IS NULL OR extension = '') AND role != 'ai'"
                ))
        conn.commit()


_SEED_TEAM = [
    ("Jonathan Reed", "JR", "#2563eb", "admin"),
    ("Sara Michael", "SM", "#7c3aed", "agent"),
    ("Maria Novak", "MN", "#0891b2", "agent"),
    ("Shurhaini A.", "SA", "#db2777", "agent"),
    ("Vera AI", "AI", "#16a34a", "ai"),
]
_SEED_PIPELINES = [
    ("Patient Inquiries", [
        ("New", "#f59e0b"), ("Outreach Started", "#22c55e"), ("Engaged Lead", "#3b82f6"),
        ("Interest Confirmed", "#16a34a"), ("Documents Pending", "#8b5cf6"),
        ("Won", "#15803d"), ("Lost", "#94a3b8"),
    ], True),
    ("External Referrals", [
        ("New referral", "#f59e0b"), ("Reviewing", "#3b82f6"),
        ("Accepted", "#16a34a"), ("Declined", "#94a3b8"),
    ], False),
]
_SEED_FIRST = ["Maria", "Stacy", "Camoray", "Gary", "Kristin", "Tooba", "Shea", "Hope", "Tammy",
               "Debra", "Tara", "Rebecca", "Cardell", "Nicholas", "Mark", "Betty", "Sam", "Dana",
               "Marcus", "Priya", "Omar", "Yojan", "Rashon", "Kimberly"]
_SEED_LAST = ["Alarcon", "Duncan", "Wathen", "Osborn", "Batchelor", "Salman", "Houston", "Freeman",
              "Perrin", "Seidel", "Knight", "Badom", "Buchanan", "Lutz", "Torres", "Carraway",
              "Rivera", "Okafor", "Lee", "Nair", "Desta", "Giri", "Braxton", "Schweppe"]
_SEED_COMPANIES = ["", "Northside Clinic", "", "Bright Health", "", "", "Wellpoint", "", "Vera"]
_SEED_TICKETS = [
    ("Appointment Update", "high", ["Reschedule request", "Cancellation notice", "New appointment request"]),
    ("Billing Question", "normal", ["Insurance eligibility check", "Invoice question", "Refund request"]),
    ("Medication", "urgent", ["Refill request", "Out of medication", "Pharmacy transfer"]),
    ("General", "low", ["Callback requested", "Left a voicemail", "Follow up needed"]),
]


def seed_desk() -> None:
    """Populate Vera Desk with sample CRM data the first time it runs, so the
    product is demoable without a live phone line. Idempotent: does nothing once
    team members exist. Everything here is clearly sample data the user can clear."""
    with Session(engine) as s:
        if s.exec(select(TeamMember)).first():
            return
        rng = random.Random(360)

        team = [TeamMember(id=new_id("tm"), name=n, initials=i, color=c, role=r) for n, i, c, r in _SEED_TEAM]
        for t in team:
            s.add(t)
        pipelines = []
        for name, stages, dflt in _SEED_PIPELINES:
            p = Pipeline(id=new_id("pl"), name=name,
                         stages_json=json.dumps([{"name": n, "color": c} for n, c in stages]), is_default=dflt)
            pipelines.append(p)
            s.add(p)
        s.commit()

        team_ids = [t.id for t in team]
        agent_ids = [t.id for t in team if t.role != "ai"]

        # contacts
        contacts = []
        for i in range(24):
            first = _SEED_FIRST[i % len(_SEED_FIRST)]
            last = _SEED_LAST[i % len(_SEED_LAST)]
            days = rng.randint(0, 20)
            c = Contact(
                id=new_id("ct"),
                name=f"{first} {last}",
                phone=f"+1{rng.randint(200,989)}{rng.randint(2000000,9999999)}",
                email=f"{first.lower()}.{last.lower()}@example.com",
                company=rng.choice(_SEED_COMPANIES),
                stage=rng.choice(CONTACT_STAGES),
                source=rng.choice(LEAD_SOURCES),
                owner=rng.choice([t.name for t in team]),
                value=rng.choice([0, 0, 250, 500, 1200, 3000]),
                last_contact_at=now() - timedelta(days=days, hours=rng.randint(0, 23)),
                created_at=now() - timedelta(days=days),
                tags_json=json.dumps(rng.sample(["vip", "new", "insured", "referral", "callback"], k=rng.randint(0, 2))),
            )
            contacts.append(c)
            s.add(c)
        s.commit()

        # leads: put ~14 contacts into pipelines
        lead_sources = ["Meta Ads", "Organic Website", "External Clinics", "Google Ads", "Referral"]
        for c in contacts[:14]:
            p = rng.choice(pipelines)
            stages = json.loads(p.stages_json)
            days = rng.randint(0, 3)
            nxt = rng.choice([2, 3, 6, 7, 9, 12, None])
            s.add(Lead(
                id=new_id("ld"), contact_id=c.id, pipeline_id=p.id,
                stage=rng.choice(stages)["name"], source=rng.choice(lead_sources),
                assignee_ids_json=json.dumps(rng.sample(agent_ids, k=rng.randint(1, 3))),
                next_response_at=(now() + timedelta(hours=nxt)) if nxt else None,
                outreach_note=(f"Next response in {nxt}h" if nxt else "No proactive outreach. Agent is not assigned"),
                value=rng.choice([0, 500, 1500, 4000]),
                created_at=now() - timedelta(days=days),
            ))

        # tickets
        for i in range(16):
            c = rng.choice(contacts)
            ttype, prio, subjects = rng.choice(_SEED_TICKETS)
            days = rng.randint(0, 3)
            s.add(Ticket(
                id=new_id("tk"),
                subject=f"{rng.choice(subjects)} — {c.name}",
                body="Logged from an inbound conversation handled by Vera.",
                status=rng.choice(TICKET_STATUSES),
                priority=prio if rng.random() < 0.4 else rng.choice(["normal", "normal", "high", "low"]),
                type=ttype,
                contact_id=c.id,
                channel=rng.choice(["call", "sms", "email", "form"]),
                assignee_ids_json=json.dumps(rng.sample(team_ids, k=rng.randint(1, 4))),
                creator=rng.choice(["Vera AI", "Jonathan Reed"]),
                created_at=now() - timedelta(days=days, hours=rng.randint(0, 23)),
                updated_at=now() - timedelta(hours=rng.randint(0, 40)),
            ))

        # a few notes on the first contacts
        for c in contacts[:6]:
            s.add(Note(id=new_id("nt"), contact_id=c.id,
                       body=rng.choice(["Called to confirm details.", "Prefers texts over calls.",
                                        "Interested, following up next week.", "Sent the intake form."]),
                       author=rng.choice([t.name for t in team])))
        s.commit()


_DEMO_THREADS = [
    {"sms": [("inbound", "Hi, I need to reschedule my appointment this Friday."),
             ("outbound", "Of course. We have Friday at two thirty or four PM open, which works better?"),
             ("inbound", "Four PM is perfect, thank you!"),
             ("outbound", "You're booked for Friday at four PM. See you then.")],
     "call": ("inbound", "completed", 168,
              [("assistant", "Thanks for calling. How can I help today?"),
               ("user", "I wanted to confirm my appointment time."),
               ("assistant", "You are set for Friday at four. Anything else?"),
               ("user", "No that is all, thanks."), ("assistant", "Have a great day.")])},
    {"sms": [("inbound", "Do you take my insurance? It's through Bright Health."),
             ("outbound", "We do work with Bright Health. Want me to run a quick eligibility check?"),
             ("inbound", "Yes please."),
             ("outbound", "Great, I'll confirm and text you back shortly.")],
     "call": ("outbound", "completed", 92,
              [("assistant", "Hi, this is a quick callback about your insurance question."),
               ("user", "Oh great, thanks for calling back."),
               ("assistant", "You're covered. I can book you in whenever suits."),
               ("user", "Let's do next week."), ("assistant", "Done, I'll text the details.")])},
    {"sms": [("inbound", "I'm almost out of my medication, can I get a refill?"),
             ("outbound", "I can help with that. I'll send the refill request to your pharmacy now."),
             ("inbound", "Thank you so much!")],
     "call": None},
    {"sms": [("inbound", "Hi, is anyone available to talk about a new patient visit?"),
             ("outbound", "Absolutely. What days generally work for you?")],
     "call": ("inbound", "completed", 210,
              [("assistant", "Thanks for calling, how can I help?"),
               ("user", "I'd like to become a new patient."),
               ("assistant", "Wonderful, I can get you started right now.")])},
    {"sms": [("outbound", "Hi, just following up on your recent visit. How are you feeling?"),
             ("inbound", "Much better, thanks for checking in."),
             ("outbound", "Glad to hear it. Reach out any time.")],
     "call": None},
    {"sms": [("inbound", "Can you send me the intake forms again?"),
             ("outbound", "Sent to your email just now. Let me know if it does not arrive.")],
     "call": ("inbound", "no-answer", 0, [])},
]


def seed_demo_conversations() -> None:
    """Populate the inbox with a handful of realistic conversations (calls and
    texts) so Vera Desk demos well before a live phone line exists. Idempotent:
    does nothing once any Conversation row exists."""
    with Session(engine) as s:
        if s.exec(select(Conversation)).first():
            return
        contacts = [c for c in s.exec(select(Contact)).all() if c.phone][:8]
        if not contacts:
            return
        team = s.exec(select(TeamMember)).all()
        agent_ids = [t.id for t in team if t.role != "ai"]
        number = s.exec(select(PhoneNumber).where(PhoneNumber.status == "active")).first()
        our = number.e164 if number else "+18445550142"
        num_id = number.id if number else None
        rng = random.Random(99)

        for i, c in enumerate(contacts):
            tmpl = _DEMO_THREADS[i % len(_DEMO_THREADS)]
            base = now() - timedelta(days=rng.randint(0, 5), hours=rng.randint(0, 10))
            last = base
            for j, (direction, text) in enumerate(tmpl["sms"]):
                ts = base + timedelta(minutes=j * rng.randint(3, 25))
                last = ts
                s.add(SmsMessage(
                    id=new_id("sm"), direction=direction,
                    from_number=(c.phone if direction == "inbound" else our),
                    to_number=(our if direction == "inbound" else c.phone),
                    number_id=num_id, counterparty=c.phone, provider="demo",
                    body=text, status=("received" if direction == "inbound" else "delivered"),
                    created_at=ts,
                ))
            call = tmpl.get("call")
            if call:
                cdir, cstatus, dur, transcript = call
                cts = base + timedelta(minutes=len(tmpl["sms"]) * 6 + rng.randint(1, 40))
                last = max(last, cts)
                cid = new_id("cl")
                room = f"call-{cid}"
                s.add(Call(
                    id=cid, direction=cdir,
                    from_number=(c.phone if cdir == "inbound" else our),
                    to_number=(our if cdir == "inbound" else c.phone),
                    number_id=num_id, provider="demo", provider_sid="", room=room,
                    status=cstatus, duration_sec=dur, created_at=cts, updated_at=cts,
                ))
                if transcript:
                    s.add(CallTranscript(
                        id=new_id("call"), room=room,
                        items_json=json.dumps([{"role": r, "text": t} for r, t in transcript]),
                        metrics_json="{}", created_at=cts,
                    ))
            # assign about half of the conversations to an agent
            assignees = [rng.choice(agent_ids)] if (agent_ids and i % 2 == 0) else []
            s.add(Conversation(
                id=new_id("cv"), peer=c.phone, contact_id=c.id,
                assignee_ids_json=json.dumps(assignees), status="open", last_at=last,
            ))
        s.commit()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)  # creates the new Folder table
    _migrate()  # backfills new Document columns on pre-existing databases
    seed_desk()  # sample CRM data on first run so Vera Desk looks alive
    seed_demo_conversations()  # sample inbox threads (calls + texts)


def get_session():
    with Session(engine) as session:
        yield session
