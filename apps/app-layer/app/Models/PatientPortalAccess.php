<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/** Patient grants are queried by user or explicit organization/patient, never by the staff session tenant. */
class PatientPortalAccess extends Model
{
    protected $fillable = ['organization_id', 'patient_id', 'user_id', 'share_clinical', 'revoked_at', 'expires_at'];

    protected function casts(): array
    {
        return ['share_clinical' => 'boolean', 'revoked_at' => 'immutable_datetime', 'expires_at' => 'immutable_datetime'];
    }

    #[Scope]
    protected function available(Builder $query): void
    {
        $query->whereNull('revoked_at')->where(fn (Builder $expiry) => $expiry->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }
}
