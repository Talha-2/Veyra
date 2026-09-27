<?php

namespace App\Enums;

enum ContactStage: string
{
    case New = 'new';
    case Open = 'open';
    case Qualified = 'qualified';
    case Won = 'won';
    case Lost = 'lost';

    public function label(): string
    {
        return ucfirst($this->value);
    }

    /**
     * Semantic token name, not a hex value.
     *
     * DESIGN.md's Two-Voice Rule limits accents to Ember and Mint outside the
     * hero waveform, and semantic colours to status. Returning a token keeps
     * that decision in CSS where the themes are defined, instead of baking a
     * light-theme hex into PHP.
     */
    public function tone(): string
    {
        return match ($this) {
            self::New => 'info',
            self::Open => 'accent',
            self::Qualified => 'warning',
            self::Won => 'success',
            self::Lost => 'muted',
        };
    }
}
