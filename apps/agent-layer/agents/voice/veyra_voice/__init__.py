"""The Veyra voice agent: a LiveKit worker running the talker/worker front desk.

``pipeline`` is pure and testable (which STT, TTS and turn detector a call
gets, from its language and the tenant's voice settings). ``front_desk`` and
``entrypoint`` import LiveKit and are exercised on a real room.
"""
