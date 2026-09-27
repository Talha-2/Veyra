"""The gateway: the app layer's front door into the agent layer.

Serves the four routes ``AgentGateway`` (PHP) calls and runs the pull loop
that claims queued automation runs. Text work — an Ask thread, an automation
— runs on the same harness ``Worker`` as a call, minus the delegation rows.
"""

from .app import create_app

__all__ = ["create_app"]
