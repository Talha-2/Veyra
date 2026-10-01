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
            self::Talker => 'Holds a voice conversation. Answers what it can; delegates what needs doing. Never blocks. The first enabled talker is the one that speaks.',
            self::Worker => 'Runs skills, lookups and actions, in voice and chat. The first enabled worker starts each conversation and hands a task to another worker when its description fits better.',
            self::Text => 'Answers your team in Ask, where there is no speaking clock. With no Text expert, Ask uses the workers.',
        };
    }

    /** Whether latency is the binding constraint on this runtime's model choice. */
    public function isLatencyCritical(): bool
    {
        return $this === self::Talker;
    }
}
