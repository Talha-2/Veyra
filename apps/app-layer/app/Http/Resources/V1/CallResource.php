<?php

namespace App\Http\Resources\V1;

use App\Models\Call;
use App\Models\Delegation;
use App\Models\ToolCall;
use Illuminate\Http\Request;

/**
 * @mixin Call
 *
 * In a list: the call and its summary. Fetched singly (`detailed()`): also
 * the turn-by-turn transcript and every talker → worker handoff with the
 * tool calls the worker made — the audit trail behind anything the agent
 * told the caller.
 */
class CallResource extends ApiResource
{
    private bool $detailed = false;

    public function detailed(): static
    {
        $this->detailed = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'object' => 'call',
            'direction' => $this->direction,
            'status' => $this->status,
            'from' => $this->from_number,
            'to' => $this->to_number,
            'contact_id' => $this->contact_id,
            'conversation_id' => $this->conversation_id,
            'duration_sec' => (int) $this->duration_sec,
            'language' => $this->language,
            'recording_url' => $this->recording_url,
            'transferred' => (bool) $this->transferred,
            'error' => $this->error,
            'summary' => $this->transcript?->summary,
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];

        if ($this->detailed) {
            $data['transcript'] = array_values($this->transcript?->items ?? []);
            $data['handoffs'] = $this->delegations->map(fn (Delegation $d) => [
                'sequence' => (int) $d->sequence,
                'status' => $d->status,
                'is_finalization' => (bool) $d->is_finalization,
                'transcript_delta' => $d->transcript_delta,
                'reply' => $d->reply,
                'error' => $d->error,
                'duration_ms' => $d->duration_ms,
                'started_at' => self::time($d->started_at),
                'completed_at' => self::time($d->completed_at),
                'tool_calls' => $d->toolCalls->map(fn (ToolCall $t) => [
                    'id' => $t->id,
                    'action' => $t->action_slug,
                    'kind' => $t->kind?->value,
                    'status' => $t->status?->value,
                    'arguments' => $t->arguments,
                    'result' => $t->result,
                    'error' => $t->error,
                    'duration_ms' => $t->duration_ms,
                    'created_at' => self::time($t->created_at),
                ])->values()->all(),
            ])->values()->all();
        }

        return $data;
    }
}
