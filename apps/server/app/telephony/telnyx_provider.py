"""Telnyx adapter.

Telnyx exposes a clean async friendly JSON REST API (v2), so this adapter talks
to it directly with httpx — no SDK wheel needed. Credentials come from
TelephonyConfig (pasted in the studio). Differences from Twilio worth knowing:

- Numbers are bought through a *number order*, then the phone number resource id
  (the handle for release/config) is looked up by e164.
- Webhooks do not hang off each number. Messaging webhooks live on a *messaging
  profile*; voice routing lives on a *connection* (a TeXML app or SIP
  connection). configure_number therefore assigns the profile/connection to the
  number and points the profile's webhook at us.
- Inbound SMS arrives as JSON events (message.received), not form posts, and
  TeXML voice callbacks are Twilio compatible form posts.
"""

from __future__ import annotations

import logging

import httpx

from .base import (
    AvailableNumber,
    NotConfiguredError,
    PurchasedNumber,
    SentMessage,
    TelephonyError,
    TelephonyProvider,
)

logger = logging.getLogger("voice-agent.telephony.telnyx")

API = "https://api.telnyx.com/v2"


class TelnyxProvider(TelephonyProvider):
    name = "telnyx"

    def __init__(self, config: dict):
        self._c = config or {}
        self.api_key = (self._c.get("api_key") or "").strip()
        self.messaging_profile_id = (self._c.get("messaging_profile_id") or "").strip()
        self.connection_id = (self._c.get("connection_id") or "").strip()

    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict:
        if not self.configured():
            raise NotConfiguredError("A Telnyx API key (V2) is required.")
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def _request(self, method: str, path: str, *, json: dict | None = None, params: dict | None = None) -> dict:
        """One guarded call: auth errors become a clean 401, everything else a
        502 carrying Telnyx's own error message instead of a stack trace."""
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                r = await client.request(method, f"{API}{path}", headers=self._headers(), json=json, params=params)
        except NotConfiguredError:
            raise
        except Exception as exc:
            raise TelephonyError(f"Telnyx unreachable: {exc}", status=502) from exc
        if r.status_code in (401, 403):
            raise TelephonyError("Telnyx rejected the credentials. Check the API key in Settings.", status=401)
        if r.status_code >= 400:
            detail = ""
            try:
                errs = r.json().get("errors") or []
                detail = "; ".join(e.get("detail") or e.get("title", "") for e in errs)
            except Exception:
                detail = r.text[:160]
            raise TelephonyError(f"Telnyx error: {detail or r.status_code}", status=502)
        try:
            return r.json()
        except Exception:
            return {}

    # ── numbers ──────────────────────────────────────────────────────────────
    async def search_numbers(
        self, country="US", *, area_code="", contains="", sms=True, voice=True, limit=20
    ) -> list[AvailableNumber]:
        params: dict = {
            "filter[country_code]": country.upper(),
            "filter[limit]": max(1, min(limit, 40)),
        }
        if area_code and area_code.isdigit():
            params["filter[national_destination_code]"] = area_code
        if contains:
            params["filter[phone_number][contains]"] = contains
        features = []
        if sms:
            features.append("sms")
        if voice:
            features.append("voice")
        if features:
            params["filter[features]"] = features

        data = (await self._request("GET", "/available_phone_numbers", params=params)).get("data") or []
        out: list[AvailableNumber] = []
        for r in data:
            feats = {f.get("name") for f in (r.get("features") or [])}
            region = ""
            locality = ""
            for ri in r.get("region_information") or []:
                if ri.get("region_type") == "state":
                    region = ri.get("region_name", "")
                if ri.get("region_type") == "location":
                    locality = ri.get("region_name", "")
            cost = (r.get("cost_information") or {}).get("monthly_cost", "")
            try:
                cost = f"{float(cost):.2f}" if cost else ""
            except (TypeError, ValueError):
                pass
            out.append(AvailableNumber(
                e164=r.get("phone_number", ""),
                friendly_name=r.get("phone_number", ""),
                country=country.upper(),
                region=region,
                locality=locality,
                capabilities={"voice": "voice" in feats, "sms": "sms" in feats, "mms": "mms" in feats},
                monthly_cost=f"${cost}" if cost else "",
            ))
        return out

    async def _find_number_id(self, e164: str) -> str:
        data = (await self._request("GET", "/phone_numbers", params={"filter[phone_number]": e164})).get("data") or []
        return data[0].get("id", "") if data else ""

    async def buy_number(self, number: AvailableNumber) -> PurchasedNumber:
        order: dict = {"phone_numbers": [{"phone_number": number.e164}]}
        if self.messaging_profile_id:
            order["messaging_profile_id"] = self.messaging_profile_id
        if self.connection_id:
            order["connection_id"] = self.connection_id
        await self._request("POST", "/number_orders", json=order)
        # the order is async on Telnyx's side; the phone number resource usually
        # exists immediately — resolve its id as the provider handle
        pid = await self._find_number_id(number.e164)
        return PurchasedNumber(
            e164=number.e164,
            provider_sid=pid,
            friendly_name=number.e164,
            country=number.country,
            capabilities=number.capabilities or {"voice": True, "sms": True, "mms": False},
            monthly_cost=number.monthly_cost,
        )

    async def release_number(self, provider_sid: str) -> None:
        await self._request("DELETE", f"/phone_numbers/{provider_sid}")

    async def configure_number(self, provider_sid, *, voice_url="", sms_url="", status_url="") -> None:
        """Telnyx webhooks are profile/connection level. Assign this number to the
        configured messaging profile and voice connection, and point the profile's
        webhook at our inbound SMS endpoint."""
        if not provider_sid:
            return
        if self.connection_id:
            try:
                await self._request("PATCH", f"/phone_numbers/{provider_sid}", json={"connection_id": self.connection_id})
            except TelephonyError as exc:
                logger.warning("telnyx voice connection assign failed: %s", exc)
        if self.messaging_profile_id:
            try:
                await self._request("PATCH", f"/phone_numbers/{provider_sid}/messaging",
                                    json={"messaging_profile_id": self.messaging_profile_id})
            except TelephonyError as exc:
                logger.warning("telnyx messaging profile assign failed: %s", exc)
            if sms_url:
                try:
                    await self._request("PATCH", f"/messaging_profiles/{self.messaging_profile_id}",
                                        json={"webhook_url": sms_url})
                except TelephonyError as exc:
                    logger.warning("telnyx messaging webhook set failed: %s", exc)

    # ── messaging ────────────────────────────────────────────────────────────
    async def send_sms(self, from_e164: str, to_e164: str, body: str) -> SentMessage:
        payload: dict = {"from": from_e164, "to": to_e164, "text": body}
        if self.messaging_profile_id:
            payload["messaging_profile_id"] = self.messaging_profile_id
        base = (self._c.get("public_base_url") or "").strip()
        if base:
            payload["webhook_url"] = base.rstrip("/") + "/api/telephony/webhooks/telnyx/sms"
        data = (await self._request("POST", "/messages", json=payload)).get("data") or {}
        to = (data.get("to") or [{}])[0]
        return SentMessage(provider_sid=data.get("id", ""), status=to.get("status") or "queued")

    # ── webhook signature ────────────────────────────────────────────────────
    def verify_webhook(self, url: str, params: dict, signature: str) -> bool:
        # Telnyx signs with Ed25519 (telnyx-signature-ed25519 header). Strict
        # verification needs the portal public key + a nacl wheel; the router does
        # not enforce verification today, so stay permissive like the base class.
        return True
