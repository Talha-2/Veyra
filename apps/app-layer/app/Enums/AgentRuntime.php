<?php

namespace App\Enums;

/**
 * Which half of the call an expert serves.
 *
 * The split is the architecture: the talker owns every word the caller hears and
 * runs a small fast model because voice answers are three sentences and
 * time-to-first-token is the budget. The worker owns skills, lookups and durable
 * writes, never renders speech, and can therefore afford a slower, better model.
 */
enum AgentRuntime: string
{
    case Talker = 'talker';
    case Worker = 'worker';
    case Text = 'text';

    public function label(): string
    {
        return match ($this) {
            self::Talker => 'Talker (speaks)',
            self::Worker => 'Worker (acts)',
            self::Text => 'Text',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Talker => 'Preserved legacy conversation profile. Configure the core taker in Runtime.',
            self::Worker => 'Optional specialist delegated a task by the core worker. Uses shared and owned private skills with explicitly granted actions.',
            self::Text => 'Optional specialist for text tasks. Runs separately with shared and owned private skills and explicitly granted actions.',
        };
    }

    /** Whether latency is the binding constraint on this runtime's model choice. */
    public function isLatencyCritical(): bool
    {
        return $this === self::Talker;
    }
}
