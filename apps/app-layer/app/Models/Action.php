<?php

namespace App\Models;

use App\Enums\ActionKind;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One tool the agent can call.
 *
 * The three flags on this model are the whole reliability story, and each one
 * exists because of a specific way tool calls go wrong on a live phone call:
 *
 * - `is_idempotent` — whether repeating the call with the same arguments is
 *   harmless. Decides whether a transport failure can simply be retried, or
 *   whether it has to be reconciled first. Booking an appointment twice because
 *   the first response timed out is a real, visible failure.
 *
 * - `is_durable_write` — whether this changed something outside our process. The
 *   talker refuses to hang up while one is in flight, and only these. An
 *   ordinary read left running costs nothing once the line is down; refusing to
 *   hang up on one strands the caller mid-goodbye.
 *
 * - `requires_approval` — whether a human sees it before it runs. The escape
 *   hatch for anything that spends money or contacts a third party.
 */
#[Fillable([
    'action_group_id', 'integration_id', 'kind', 'slug', 'name', 'description',
    'parameters', 'config', 'is_idempotent', 'is_durable_write',
    'requires_approval', 'timeout_ms', 'max_retries', 'enabled',
])]
class Action extends Model
{
    use BelongsToTenant;

    protected function casts(): array
    {
        return [
            'kind' => ActionKind::class,
            'parameters' => 'array',
            'config' => 'array',
            'is_idempotent' => 'boolean',
            'is_durable_write' => 'boolean',
            'requires_approval' => 'boolean',
            'enabled' => 'boolean',
        ];
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(ActionGroup::class, 'action_group_id');
    }

    public function integration(): BelongsTo
    {
        return $this->belongsTo(Integration::class);
    }

    public function experts(): BelongsToMany
    {
        return $this->belongsToMany(Expert::class)->withTimestamps();
    }

    public function toolCalls(): HasMany
    {
        return $this->hasMany(ToolCall::class);
    }

    public function scopeEnabled(Builder $query): void
    {
        $query->where('enabled', true);
    }

    /**
     * The tool definition handed to the model.
     *
     * The description is what the model selects on, so it is product copy with
     * a functional job — a vague description is a wrong tool call, not a
     * cosmetic problem.
     */
    public function toToolSchema(): array
    {
        return [
            'name' => $this->slug,
            'description' => $this->description,
            'input_schema' => $this->parameters ?: [
                'type' => 'object',
                'properties' => new \stdClass,
            ],
        ];
    }

    /**
     * The full tool spec the agent layer runs this action from: the schema,
     * the three reliability flags, and the config its executor needs.
     *
     * The one definition of that payload. The context bundle, automation runs
     * and approvals all ship it, so an action behaves the same wherever it is
     * called from.
     */
    public function toToolSpec(): array
    {
        return [
            ...$this->toToolSchema(),
            'id' => $this->id,
            'kind' => $this->kind->value,
            'is_idempotent' => $this->is_idempotent,
            'is_durable_write' => $this->is_durable_write,
            'requires_approval' => $this->requires_approval,
            'timeout_ms' => $this->timeout_ms,
            'max_retries' => $this->max_retries,
            'config' => $this->kind->isExternal() ? ($this->runtimeConfig() ?: new \stdClass) : null,
        ];
    }

    /**
     * The config as the executor needs it. An MCP action points at its
     * server: the URL and transport come from the integration (so editing
     * the server updates every tool), and the auth headers are resolved from
     * the integration's encrypted credentials here, at send time.
     */
    public function runtimeConfig(): array
    {
        $config = $this->config ?? [];
        if ($this->kind === ActionKind::Mcp && $this->integration) {
            $server = $this->integration->config ?? [];
            $config['url'] = $server['url'] ?? ($config['url'] ?? null);
            $config['transport'] = $server['transport'] ?? ($config['transport'] ?? 'streamable_http');
            $config['headers'] = $this->integration->mcpHeaders() ?: new \stdClass;
        }

        return $config;
    }

    /**
     * Whether a failed attempt may simply be tried again.
     *
     * Note the asymmetry: an idempotent action can always be retried, but a
     * non-idempotent one can only be retried when we never learned whether it
     * landed — and even then only behind an idempotency key.
     */
    public function canRetryAfter(string $failure): bool
    {
        if ($this->is_idempotent) {
            return true;
        }

        // A timeout means the call may well have succeeded and we lost the
        // answer. A refusal or a validation error means it certainly did not.
        return $failure !== 'timeout';
    }
}
