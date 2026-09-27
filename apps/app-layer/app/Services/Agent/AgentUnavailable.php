<?php

namespace App\Services\Agent;

use RuntimeException;

/**
 * The agent layer could not be reached, or refused.
 *
 * Deliberately one exception: callers do not branch on *why*. Whatever the
 * reason, the honest behaviour is the same — record the intent, tell the
 * person the agent is not connected, and let the pull path (the agent
 * claiming queued work) finish it later.
 */
class AgentUnavailable extends RuntimeException
{
    public static function notConfigured(): self
    {
        return new self('AGENT_GATEWAY_URL is not set; there is no agent layer to talk to.');
    }

    public static function because(string $reason): self
    {
        return new self("Agent layer unavailable: {$reason}");
    }
}
