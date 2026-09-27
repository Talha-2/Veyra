<?php

namespace App\Enums;

/**
 * The channels a conversation can arrive on.
 *
 * PRODUCT.md principle 3: "one brain, every channel — voice, chat, phone and
 * messaging are the same agent; never present them as separate products." This
 * enum is a transport detail, not a product boundary.
 */
enum Channel: string
{
    case Call = 'call';
    case Sms = 'sms';
    case Email = 'email';
    case WebChat = 'web_chat';
    case Fax = 'fax';

    public function label(): string
    {
        return match ($this) {
            self::Call => 'Call',
            self::Sms => 'SMS',
            self::Email => 'Email',
            self::WebChat => 'Chat',
            self::Fax => 'Fax',
        };
    }

    /** Which identifier type addresses this channel. */
    public function identifierType(): IdentifierType
    {
        return match ($this) {
            self::Call, self::Sms, self::Fax => IdentifierType::Phone,
            self::Email => IdentifierType::Email,
            self::WebChat => IdentifierType::WebSession,
        };
    }

    /** Whether a human can compose on this channel from the Desk. */
    public function isComposable(): bool
    {
        // Calls are placed, not composed; web chat needs a live visitor session.
        return match ($this) {
            self::Sms, self::Email, self::Fax => true,
            self::Call, self::WebChat => false,
        };
    }
}
