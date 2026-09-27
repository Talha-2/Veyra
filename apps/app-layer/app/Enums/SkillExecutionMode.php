<?php

namespace App\Enums;

enum SkillExecutionMode: string
{
    case Prose = 'prose';
    case Gated = 'gated';

    public function label(): string
    {
        return match ($this) {
            self::Prose => 'Prose',
            self::Gated => 'Step-gated',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Prose => 'The model reads the instructions and uses its judgement. Handles cases you did not write down.',
            self::Gated => 'The model is bound to one step at a time and cannot skip ahead. For procedures that must not be improvised.',
        };
    }

    /** Shown in Studio so the trade-off is stated where the choice is made. */
    public function caution(): ?string
    {
        return match ($this) {
            self::Prose => 'On a fast voice model, long prose skills can drift. Keep them short and concrete.',
            self::Gated => 'The agent cannot adapt to anything the steps do not cover. It will follow them literally.',
        };
    }
}
