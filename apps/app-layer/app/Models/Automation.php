<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A configured agent that runs on its own.
 *
 * This is what the retired server called an "Expert": a system prompt, a goal,
 * a tool allow-list and one or more triggers — a schedule, a signed webhook, an
 * app event, or a button. It is deliberately not the harness Expert (the talker
 * and worker on a live call); those are halves of one conversation, this is a
 * job. Z360 draws the same line and calls these Automations.
 */
#[Fillable([
    'name', 'description', 'system_prompt', 'goal', 'triggers', 'schedule', 'app_trigger',
    'reasoning', 'allowed_action_ids', 'can_search_knowledge', 'enabled', 'created_by_id',
])]
class Automation extends Model
{
    use BelongsToTenant, SoftDeletes;

    public const TRIGGERS = ['manual', 'schedule', 'webhook', 'app_event'];

    protected function casts(): array
    {
        return [
            'triggers' => 'array',
            'schedule' => 'array',
            'app_trigger' => 'array',
            'allowed_action_ids' => 'array',
            'can_search_knowledge' => 'boolean',
            'enabled' => 'boolean',
            'next_run_at' => 'datetime',
            'last_run_at' => 'datetime',
        ];
    }

    public function runs(): HasMany
    {
        return $this->hasMany(AutomationRun::class)->latest();
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function scopeDue(Builder $query): void
    {
        $query->where('enabled', true)->whereNotNull('next_run_at')->where('next_run_at', '<=', now());
    }

    public function hasTrigger(string $trigger): bool
    {
        return in_array($trigger, $this->triggers ?? [], strict: true);
    }

    /**
     * When the schedule next fires, from now, in the schedule's timezone.
     *
     * Lives on the model because two things need it: Studio when a schedule
     * is saved, and the claim route when a run is handed to the agent and the
     * next one has to be booked. Two copies would drift.
     */
    public function computeNextRun(): ?\Illuminate\Support\Carbon
    {
        $schedule = $this->schedule ?? [];
        $tz = $schedule['tz'] ?? 'UTC';
        $now = now($tz);

        return match ($schedule['kind'] ?? null) {
            'hourly' => $now->copy()->addHour()->startOfHour(),
            'interval' => $now->copy()->addMinutes((int) ($schedule['interval_minutes'] ?? 60)),
            'daily' => (function () use ($now, $schedule) {
                [$h, $m] = explode(':', $schedule['at'] ?? '09:00');
                $t = $now->copy()->setTime((int) $h, (int) $m);

                return $t->isPast() ? $t->addDay() : $t;
            })(),
            'weekly' => (function () use ($now, $schedule) {
                [$h, $m] = explode(':', $schedule['at'] ?? '09:00');

                return $now->copy()->next($schedule['weekday'] ?? 'monday')->setTime((int) $h, (int) $m);
            })(),
            default => null,
        };
    }

    /** Human description of the schedule, for the list. */
    public function scheduleLabel(): ?string
    {
        if (! $this->hasTrigger('schedule') || ! $this->schedule) {
            return null;
        }

        $s = $this->schedule;

        return match ($s['kind'] ?? null) {
            'hourly' => 'Every hour',
            'daily' => 'Daily at '.($s['at'] ?? '09:00'),
            'weekly' => ucfirst($s['weekday'] ?? 'monday').' at '.($s['at'] ?? '09:00'),
            'interval' => 'Every '.($s['interval_minutes'] ?? 60).' min',
            default => null,
        };
    }
}
