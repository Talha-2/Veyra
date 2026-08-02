"""Twilio adapter.

The Twilio helper SDK is synchronous, so every call is pushed to a thread — the
FastAPI event loop never blocks on the network. Credentials come from
TelephonyConfig (pasted in the studio), not the environment, so telephony is
turned on as a product action. Nothing here imports Twilio at module load; the
import is lazy so the server boots even when the wheel or the keys are absent.
"""

from __future__ import annotations

import asyncio
import logging

from .base import (
    AvailableNumber,
    NotConfiguredError,
    PurchasedNumber,
    SentMessage,
    TelephonyError,
    TelephonyProvider,
)

logger = logging.getLogger("voice-agent.telephony.twilio")


class TwilioProvider(TelephonyProvider):
    name = "twilio"

    def __init__(self, config: dict):
        self._c = config or {}
        self.account_sid = (self._c.get("account_sid") or "").strip()
        self.auth_token = (self._c.get("auth_token") or "").strip()
        self.messaging_service_sid = (self._c.get("messaging_service_sid") or "").strip()

    def configured(self) -> bool:
        return bool(self.account_sid and self.auth_token)

    @staticmethod
    def _is_auth_error(exc: Exception) -> bool:
        # Paged list() calls raise a bare TwilioException whose .status/.code are
        # None — the real code lives only in the string ("HTTP 401 {...20003...}").
        # A plain TwilioRestException does carry .status/.code. Check both.
        status = getattr(exc, "status", None) or getattr(exc, "code", None)
        if status in (401, 403, 20003, 20005):
            return True
        s = str(exc).lower()
        return any(
            m in s for m in ("http 401", "http 403", "20003", "20005", "authentication error", "not authorized")
        )

    @staticmethod
    def _twilio_message(exc: Exception) -> str:
        """A clean, human sentence from a Twilio error, which otherwise stringifies
        to a wall of URL + status + embedded JSON."""
        s = str(exc)
        if getattr(exc, "status", None) in (401, 403) or "http 401" in s.lower() or "http 403" in s.lower() or "20003" in s:
            return "Twilio rejected the credentials. Check the Account SID and Auth Token in Settings."
        msg = getattr(exc, "msg", "") or ""
        if not msg:  # pull the message out of the embedded {"message": …} if present
            import json
            import re

            m = re.search(r"\{.*\}", s)
            if m:
                try:
                    msg = json.loads(m.group(0)).get("message", "")
                except Exception:
                    msg = ""
        return f"Twilio error: {msg or s[:160]}"

    def _client(self):
        if not self.configured():
            raise NotConfiguredError("Twilio Account SID and Auth Token are required.")
        try:
            from twilio.rest import Client
        except ImportError as exc:  # pragma: no cover - dep guaranteed in the image
            raise TelephonyError("The twilio package is not installed on the server.", status=500) from exc
        return Client(self.account_sid, self.auth_token)

    async def _run_guarded(self, fn):
        """Run a blocking Twilio call off the event loop and translate its errors
        into a clean TelephonyError the router can turn into a tidy 4xx/5xx."""
        try:
            return await asyncio.to_thread(fn)
        except TelephonyError:
            raise
        except Exception as exc:
            status = 401 if self._is_auth_error(exc) else 502
            raise TelephonyError(self._twilio_message(exc), status=status) from exc

    # ── numbers ──────────────────────────────────────────────────────────────
    async def search_numbers(
        self, country="US", *, area_code="", contains="", sms=True, voice=True, limit=20
    ) -> list[AvailableNumber]:
        def _run() -> list[AvailableNumber]:
            client = self._client()
            country_ctx = client.available_phone_numbers(country.upper())
            kw: dict = {"limit": max(1, min(limit, 40))}
            if area_code and area_code.isdigit():
                kw["area_code"] = int(area_code)
            if contains:
                kw["contains"] = contains
            if sms:
                kw["sms_enabled"] = True
            if voice:
                kw["voice_enabled"] = True

            # Most countries sell "local" numbers; some only mobile/national. Try
            # local first, then fall back so a search never comes back empty for a
            # reason the user can't see. We keep the last error so a real failure
            # (bad credentials, unsupported country) surfaces instead of looking
            # like an empty inventory — swallowing a 401 as "no matches" is exactly
            # the kind of silent lie that wastes an hour of debugging.
            rows: list = []
            last_err: Exception | None = None
            for kind in ("local", "mobile", "toll_free", "national"):
                lister = getattr(country_ctx, kind, None)
                if lister is None:
                    continue
                try:
                    rows = lister.list(**kw)
                except Exception as exc:
                    last_err = exc
                    # authentication failures are terminal — every kind will fail
                    # the same way, so stop and report it now
                    if self._is_auth_error(exc):
                        raise TelephonyError(self._twilio_message(exc), status=401)
                    continue
                if rows:
                    break
            if not rows and last_err is not None:
                raise TelephonyError(self._twilio_message(last_err), status=502)

            out: list[AvailableNumber] = []
            for r in rows:
                caps = getattr(r, "capabilities", {}) or {}
                out.append(
                    AvailableNumber(
                        e164=r.phone_number,
                        friendly_name=getattr(r, "friendly_name", "") or r.phone_number,
                        country=country.upper(),
                        region=getattr(r, "region", "") or "",
                        locality=getattr(r, "locality", "") or "",
                        capabilities={
                            "voice": bool(caps.get("voice", True)),
                            "sms": bool(caps.get("SMS", caps.get("sms", True))),
                            "mms": bool(caps.get("MMS", caps.get("mms", False))),
                        },
                    )
                )
            return out

        return await self._run_guarded(_run)

    async def buy_number(self, number: AvailableNumber) -> PurchasedNumber:
        def _run() -> PurchasedNumber:
            client = self._client()
            bought = client.incoming_phone_numbers.create(phone_number=number.e164)
            caps = getattr(bought, "capabilities", {}) or {}
            return PurchasedNumber(
                e164=bought.phone_number,
                provider_sid=bought.sid,
                friendly_name=getattr(bought, "friendly_name", "") or number.e164,
                country=number.country,
                capabilities={
                    "voice": bool(caps.get("voice", True)),
                    "sms": bool(caps.get("SMS", caps.get("sms", True))),
                    "mms": bool(caps.get("MMS", caps.get("mms", False))),
                },
            )

        return await self._run_guarded(_run)

    async def release_number(self, provider_sid: str) -> None:
        def _run() -> None:
            client = self._client()
            client.incoming_phone_numbers(provider_sid).delete()

        await self._run_guarded(_run)

    async def configure_number(self, provider_sid, *, voice_url="", sms_url="", status_url="") -> None:
        def _run() -> None:
            client = self._client()
            kw: dict = {}
            if voice_url:
                kw["voice_url"] = voice_url
                kw["voice_method"] = "POST"
            if sms_url:
                kw["sms_url"] = sms_url
                kw["sms_method"] = "POST"
            if status_url:
                kw["status_callback"] = status_url
                kw["status_callback_method"] = "POST"
            if kw:
                client.incoming_phone_numbers(provider_sid).update(**kw)

        await self._run_guarded(_run)

    # ── messaging ────────────────────────────────────────────────────────────
    async def send_sms(self, from_e164: str, to_e164: str, body: str) -> SentMessage:
        def _run() -> SentMessage:
            client = self._client()
            kw: dict = {"to": to_e164, "body": body}
            # A Messaging Service (sender pool / compliance) wins over a bare From
            # when one is configured, matching Twilio's own recommendation.
            if self.messaging_service_sid:
                kw["messaging_service_sid"] = self.messaging_service_sid
            else:
                kw["from_"] = from_e164
            status_url = (self._c.get("public_base_url") or "").strip()
            if status_url:
                kw["status_callback"] = status_url.rstrip("/") + "/api/telephony/webhooks/twilio/sms-status"
            msg = client.messages.create(**kw)
            return SentMessage(provider_sid=msg.sid, status=msg.status or "queued")

        return await self._run_guarded(_run)

    # ── webhook signature ────────────────────────────────────────────────────
    def verify_webhook(self, url: str, params: dict, signature: str) -> bool:
        if not signature or not self.auth_token:
            return False
        try:
            from twilio.request_validator import RequestValidator

            return RequestValidator(self.auth_token).validate(url, params, signature)
        except Exception:
            return False


class UnconfiguredProvider(TelephonyProvider):
    """Stand-in when no provider is set up. Every action raises a clean 409 so the
    studio can render a 'connect a provider' state instead of erroring, and the
    read endpoints (list numbers/calls/messages) work off the DB regardless."""

    name = "none"

    async def search_numbers(self, *a, **k):
        raise NotConfiguredError()

    async def buy_number(self, number):
        raise NotConfiguredError()

    async def release_number(self, provider_sid):
        raise NotConfiguredError()

    async def configure_number(self, provider_sid, **k):
        raise NotConfiguredError()

    async def send_sms(self, from_e164, to_e164, body):
        raise NotConfiguredError()
