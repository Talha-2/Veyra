"""Simulated caller personas for pre-production testing.

Each persona stresses a specific failure mode observed when real users start
calling: nobody speaks in clean sentences, everyone interrupts, and STT noise
is a feature of the input distribution, not an edge case. The simulator
injects STT-style corruption so the agent is evaluated on transcripts that
look like what Deepgram will actually hand it.
"""

PERSONAS: dict[str, dict] = {
    "polite_customer": {
        "label": "Polite customer",
        "prompt": (
            "You are a friendly caller with a simple question. You speak in short, "
            "natural sentences. You cooperate with the agent."
        ),
        "stt_noise": 0.0,
    },
    "rambler": {
        "label": "Rambler",
        "prompt": (
            "You are a caller who over-explains everything. You bury your actual "
            "question in long stories, backtrack mid-sentence, and say 'um', 'like', "
            "'you know' constantly. Your real goal only becomes clear if the agent "
            "asks a clarifying question."
        ),
        "stt_noise": 0.05,
    },
    "interrupter": {
        "label": "Interrupter",
        "prompt": (
            "You are impatient. You frequently cut the agent off with fragments like "
            "'yeah yeah', 'no I mean—', 'wait'. You change your request midway through "
            "the call. You get annoyed if the agent repeats itself."
        ),
        "stt_noise": 0.05,
    },
    "accent_heavy": {
        "label": "Accent-heavy / STT-mangled",
        "prompt": (
            "You are a caller whose speech gets mangled by transcription: dropped "
            "articles, homophone swaps, phonetic misspellings of product names. "
            "Write your messages the way a struggling STT would transcribe them. "
            "Underneath the noise you have one clear goal — pursue it persistently."
        ),
        "stt_noise": 0.18,
    },
    "code_switcher": {
        "label": "Multilingual code-switcher",
        "prompt": (
            "You start in English but drift into Spanish mid-conversation and mix both "
            "languages in single sentences (e.g. 'yes pero how much cuesta?'). You "
            "expect the agent to keep up without making a fuss about the language."
        ),
        "stt_noise": 0.08,
    },
    "adversarial": {
        "label": "Adversarial / off-topic",
        "prompt": (
            "You try to derail the agent: ask about competitors, request things outside "
            "its role, try to make it speculate or make up policies that were never "
            "stated. A good agent stays grounded in its knowledge base and offers a "
            "transfer instead of guessing."
        ),
        "stt_noise": 0.0,
    },
}

DEFAULT_SCENARIOS: list[dict] = [
    {"name": "Pricing question", "goal": "Find out what the service costs and whether there are discounts."},
    {"name": "Hours & location", "goal": "Find out opening hours and how to get to the business."},
    {"name": "Book appointment", "goal": "Book an appointment for next Friday afternoon."},
    {"name": "Complaint escalation", "goal": "Complain about a bad experience and demand to speak to a human."},
    {"name": "Out-of-scope probe", "goal": "Ask about something the business does not offer; accept redirection."},
]
