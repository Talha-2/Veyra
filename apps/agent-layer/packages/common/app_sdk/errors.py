"""Errors the app layer can hand back, as exceptions the caller can branch on.

Only the distinctions the agent acts on differently get a class. A 409 on a
delegation is "you already sent that segment" and the talker must not retry;
a 404 on a skill is "read something else"; everything else is a fault to log
with the server's message intact.
"""

from __future__ import annotations


class AppSdkError(Exception):
    """A response the contract does not allow, or a transport failure."""

    def __init__(self, message: str, *, status: int | None = None, code: str | None = None, path: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.path = path

    def __str__(self) -> str:  # pragma: no cover - formatting only
        where = f" ({self.status} on {self.path})" if self.status else ""
        return f"{super().__str__()}{where}"


class Unauthenticated(AppSdkError):
    """401. The shared secret is missing or wrong on one side; the message says which."""


class NotFound(AppSdkError):
    """404. The record does not exist in this tenant — including records that exist in another."""


class Conflict(AppSdkError):
    """409. The invariant the server enforces was violated (a duplicate delegation sequence)."""


class Unavailable(AppSdkError):
    """The app layer could not be reached or answered 5xx."""
