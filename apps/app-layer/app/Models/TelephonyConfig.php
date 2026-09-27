<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Which telephony provider a tenant uses, and its credentials.
 *
 * Held in the database rather than only in env so telephony can be turned on
 * from Studio by pasting keys — and because these are the tenant's credentials,
 * not the deployment's.
 */
#[Fillable(['provider', 'credentials', 'livekit'])]
class TelephonyConfig extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            // Encrypted at rest: these can place calls and spend the customer's
            // money. A database dump must not be a credential dump.
            'credentials' => 'encrypted:array',
            // LiveKit SIP trunk and dispatch-rule ids we provisioned, cached so
            // they are created once per tenant rather than once per call.
            'livekit' => 'array',
        ];
    }
}
