<?php

namespace App\Enums;

enum IdentifierType: string
{
    case Phone = 'phone';
    case Email = 'email';
    case WebSession = 'web_session';

    public function label(): string
    {
        return match ($this) {
            self::Phone => 'Phone',
            self::Email => 'Email',
            self::WebSession => 'Web visitor',
        };
    }

    /**
     * Canonical form for matching.
     *
     * Two spellings of one address must produce one identifier, or a single
     * customer's history splits across threads. This is deliberately strict
     * rather than clever.
     */
    public function normalize(string $value): string
    {
        return match ($this) {
            // Digits only, then a leading +. Not full E.164 parsing — that needs
            // a region hint the caller may not have — but enough that the same
            // number written four ways collapses to one row. Real E.164
            // normalization happens at the telephony boundary, where the region
            // is known, before it reaches here.
            self::Phone => '+'.ltrim(preg_replace('/\D+/', '', $value), '0'),

            self::Email => mb_strtolower(trim($value)),

            // Opaque token from the widget; never reformat it.
            self::WebSession => trim($value),
        };
    }
}
