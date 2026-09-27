<?php

namespace App\Enums;

/**
 * The two product surfaces.
 *
 * Desk and Studio are separate products that happen to share a codebase, a
 * database and an auth system. They do not share navigation, layout or access:
 * a membership grants each one independently. This enum is the single place
 * that fact is named.
 */
enum Surface: string
{
    case Desk = 'desk';
    case Studio = 'studio';

    /** The Gate ability that guards this surface's routes. */
    public function gate(): string
    {
        return 'access-'.$this->value;
    }

    public function label(): string
    {
        return match ($this) {
            self::Desk => 'Veyra Desk',
            self::Studio => 'Veyra Studio',
        };
    }

    /** One line, for the app switcher. */
    public function tagline(): string
    {
        return match ($this) {
            self::Desk => 'Work the conversations',
            self::Studio => 'Build and supervise the agent',
        };
    }

    /** Where this surface opens. */
    public function home(): string
    {
        return match ($this) {
            self::Desk => '/desk',
            self::Studio => '/studio',
        };
    }
}
