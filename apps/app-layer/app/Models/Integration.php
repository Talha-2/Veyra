<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A connected external account: Composio, a raw OAuth app, an API key, or an MCP server. */
#[Fillable(['provider', 'toolkit', 'label', 'status', 'external_account_id', 'credentials', 'config', 'error', 'connected_at'])]
class Integration extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            // Encrypted at rest: these tokens can act as the customer in someone
            // else's system. A database dump must not be a credential dump.
            'credentials' => 'encrypted:array',
            'config' => 'array',
            'connected_at' => 'datetime',
        ];
    }

    public function actions(): HasMany
    {
        return $this->hasMany(Action::class);
    }

    public function actionGroups(): HasMany
    {
        return $this->hasMany(ActionGroup::class);
    }

    public function isConnected(): bool
    {
        return $this->status === 'connected';
    }
}
