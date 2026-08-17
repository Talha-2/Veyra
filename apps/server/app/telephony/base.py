"""Provider-agnostic telephony interface.

The rest of the platform talks to `TelephonyProvider`, never to Twilio directly.
That keeps the router, the UI, and the agent identical no matter who carries the
call — swapping Twilio for Telnyx or SignalWire is one new adapter class, not a
rewrite. Number search/buy/release and SMS are the provider's job; the actual
call audio is bridged into the LiveKit agent (see livekit_sip.py), so the
provider only has to hand us a SIP trunk and dial PSTN — it never touches media.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class TelephonyError(RuntimeError):
    """A provider call failed. Carries a user-facing message; the router turns it
    into a clean 4xx/5xx instead of leaking a stack trace to the studio."""

    def __init__(self, message: str, *, status: int = 502):
        super().__init__(message)
        self.status = status


class NotConfiguredError(TelephonyError):
    def __init__(self, message: str = "Telephony is not configured. Add provider credentials in Settings."):
        super().__init__(message, status=409)


@dataclass
class AvailableNumber:
    """A number offered for purchase in the provider's inventory."""

    e164: str
    friendly_name: str = ""
    country: str = "US"
    region: str = ""  # state/province
    locality: str = ""  # city
    capabilities: dict = field(default_factory=lambda: {"voice": True, "sms": True, "mms": False})
    monthly_cost: str = ""  # e.g. "$1.15" — as the provider quotes it
    provider_meta: dict = field(default_factory=dict)  # anything the buy step needs

    def to_dict(self) -> dict:
        return {
            "e164": self.e164,
            "friendly_name": self.friendly_name or self.e164,
            "country": self.country,
            "region": self.region,
            "locality": self.locality,
            "capabilities": self.capabilities,
            "monthly_cost": self.monthly_cost,
        }


@dataclass
class PurchasedNumber:
    """The result of buying a number: the provider's handle plus what it can do."""

    e164: str
    provider_sid: str
    friendly_name: str = ""
    country: str = "US"
    capabilities: dict = field(default_factory=lambda: {"voice": True, "sms": True, "mms": False})
    monthly_cost: str = ""


@dataclass
class SentMessage:
    provider_sid: str
    status: str = "queued"


@dataclass
class SentFax:
    provider_sid: str
    status: str = "queued"


class TelephonyProvider(ABC):
    """One carrier. Concrete adapters (TwilioProvider) implement each method; the
    UnconfiguredProvider stub raises NotConfiguredError so an un-set-up workspace
    still renders its telephony pages instead of 500-ing."""

    name: str = "base"

    def configured(self) -> bool:
        return False

    # ── numbers ──────────────────────────────────────────────────────────────
    @abstractmethod
    async def search_numbers(
        self,
        country: str = "US",
        *,
        area_code: str = "",
        contains: str = "",
        sms: bool = True,
        voice: bool = True,
        limit: int = 20,
    ) -> list[AvailableNumber]:
        ...

    @abstractmethod
    async def buy_number(self, number: AvailableNumber) -> PurchasedNumber:
        ...

    @abstractmethod
    async def release_number(self, provider_sid: str) -> None:
        ...

    @abstractmethod
    async def configure_number(
        self, provider_sid: str, *, voice_url: str = "", sms_url: str = "", status_url: str = ""
    ) -> None:
        """Point a number's inbound webhooks at us so calls and texts arrive."""
        ...

    # ── messaging ────────────────────────────────────────────────────────────
    @abstractmethod
    async def send_sms(self, from_e164: str, to_e164: str, body: str) -> SentMessage:
        ...

    # ── fax ──────────────────────────────────────────────────────────────────
    async def send_fax(self, from_e164: str, to_e164: str, media_url: str) -> SentFax:
        """Transmit a document (PDF URL) as a fax. Providers that cannot fax get
        this honest default instead of a silent no-op: Twilio retired
        Programmable Fax for new accounts, so only Telnyx overrides it."""
        raise TelephonyError(
            f"Faxing is not supported on {self.name}. Connect Telnyx to send and receive faxes.",
            status=409,
        )

    # ── inbound webhook parsing / signature ──────────────────────────────────
    def verify_webhook(self, url: str, params: dict, signature: str) -> bool:
        """Validate an inbound webhook actually came from the provider. Default is
        permissive so local dev works without HTTPS; Twilio overrides it."""
        return True
