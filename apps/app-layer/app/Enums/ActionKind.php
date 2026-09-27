<?php

namespace App\Enums;

/**
 * Where a tool call actually goes.
 *
 * This is not a label — it determines the failure modes. An internal action runs
 * in our own transaction and either commits or does not. Everything else crosses
 * a network to someone else's system, where a call can succeed and still return
 * an error, or time out after having already taken effect.
 */
enum ActionKind: string
{
    case Internal = 'internal';
    case Http = 'http';
    case Composio = 'composio';
    case Mcp = 'mcp';

    public function label(): string
    {
        return match ($this) {
            self::Internal => 'Built-in',
            self::Http => 'HTTP request',
            self::Composio => 'Composio',
            self::Mcp => 'MCP server',
        };
    }

    /** Whether this call leaves our process. */
    public function isExternal(): bool
    {
        return $this !== self::Internal;
    }

    /**
     * Whether a failure can leave the outside world half-changed.
     *
     * Internal actions are transactional, so they cannot. Everything else can,
     * and that is why external actions need idempotency keys rather than bare
     * retries.
     */
    public function canPartiallyApply(): bool
    {
        return $this->isExternal();
    }

    public function defaultTimeoutMs(): int
    {
        return match ($this) {
            self::Internal => 5_000,
            self::Http, self::Composio => 15_000,
            // MCP servers are often cold-started on first use.
            self::Mcp => 30_000,
        };
    }
}
