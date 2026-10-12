<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class PatientPortalInvitation extends Model
{
    use BelongsToTenant;

    protected $fillable = ['patient_id', 'email', 'token_hash', 'share_clinical', 'expires_at', 'redeemed_at', 'revoked_at', 'invited_by'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['share_clinical' => 'boolean', 'expires_at' => 'immutable_datetime', 'redeemed_at' => 'immutable_datetime', 'revoked_at' => 'immutable_datetime'];
    }
}
