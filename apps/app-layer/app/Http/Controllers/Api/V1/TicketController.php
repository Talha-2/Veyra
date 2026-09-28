<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Http\Resources\V1\NoteResource;
use App\Http\Resources\V1\TicketResource;
use App\Models\Activity;
use App\Models\Note;
use App\Models\Ticket;
use App\Models\TicketType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TicketController extends ApiController
{
    private const WITH = ['ticketType', 'assignees:id', 'tags'];

    public function index(Request $request): JsonResponse
    {
        $f = $this->check($request, [
            'status' => ['sometimes', Rule::enum(TicketStatus::class)],
            'priority' => ['sometimes', Rule::enum(TicketPriority::class)],
            'contact_id' => ['sometimes', 'integer'],
            'type_id' => ['sometimes', 'integer'],
            'number' => ['sometimes', 'integer'],
            'q' => ['sometimes', 'string', 'max:120'],
        ]);

        $query = Ticket::query()->with(self::WITH)
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['priority'] ?? null, fn ($q, $p) => $q->where('priority', $p))
            ->when($f['contact_id'] ?? null, fn ($q, $id) => $q->where('contact_id', $id))
            ->when($f['type_id'] ?? null, fn ($q, $id) => $q->where('ticket_type_id', $id))
            ->when($f['number'] ?? null, fn ($q, $n) => $q->where('number', $n))
            ->when($f['q'] ?? null, fn ($q, $t) => $q->whereRaw('lower(subject) like ?', ['%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower($t)).'%']));

        return $this->list($request, $query, TicketResource::class);
    }

    public function show(Ticket $ticket): JsonResponse
    {
        return response()->json(new TicketResource($ticket->load(self::WITH)));
    }

    public function store(Request $request): JsonResponse
    {
        $v = $this->check($request, [
            'subject' => ['required', 'string', 'max:255'],
            ...$this->rules(),
        ]);

        $ticket = DB::transaction(function () use ($v) {
            $status = TicketStatus::from($v['status'] ?? TicketStatus::Open->value);
            $ticket = Ticket::create([
                ...collect($v)->except(['tags', 'type_id', 'status'])->all(),
                'ticket_type_id' => $v['type_id'] ?? null,
                'status' => $status,
                'channel' => 'api',
            ]);
            if ($status->isTerminal()) {
                $ticket->forceFill(['resolved_at' => now()])->save();
            }
            // Same routing as a ticket raised in Desk: the type's default assignees.
            $type = isset($v['type_id']) ? TicketType::find($v['type_id']) : null;
            $ticket->assignees()->sync($type?->default_assignee_ids ?? []);
            if (! empty($v['tags'])) {
                $ticket->syncTags($v['tags']);
            }
            Activity::log($ticket, 'created', 'Ticket created through the API', actor: 'api');

            return $ticket;
        });

        return response()->json(new TicketResource($ticket->refresh()->load(self::WITH)), 201);
    }

    public function update(Request $request, Ticket $ticket): JsonResponse
    {
        $v = $this->check($request, [
            'subject' => ['sometimes', 'string', 'max:255'],
            ...collect($this->rules())->map(fn ($r) => ['sometimes', ...$r])->all(),
        ]);

        DB::transaction(function () use ($ticket, $v) {
            $ticket->fill(collect($v)->except(['tags', 'type_id'])->all());
            if (array_key_exists('type_id', $v)) {
                $ticket->ticket_type_id = $v['type_id'];
            }
            if ($ticket->isDirty('status')) {
                $ticket->resolved_at = $ticket->status->isTerminal() ? now() : null;
                Activity::log($ticket, 'status_changed', "Status set to {$ticket->status->label()} through the API", actor: 'api');
            }
            if ($ticket->isDirty('priority')) {
                Activity::log($ticket, 'priority_changed', "Priority set to {$ticket->priority->label()} through the API", actor: 'api');
            }
            $ticket->save();
            if (array_key_exists('tags', $v)) {
                $ticket->syncTags($v['tags'] ?? []);
            }
        });

        return response()->json(new TicketResource($ticket->refresh()->load(self::WITH)));
    }

    public function notes(Request $request, Ticket $ticket): JsonResponse
    {
        $query = Note::query()->with('author:id,name')
            ->where('notable_type', $ticket->getMorphClass())->where('notable_id', $ticket->id);

        return $this->list($request, $query, NoteResource::class);
    }

    public function storeNote(Request $request, Ticket $ticket): JsonResponse
    {
        $v = $this->check($request, ['body' => ['required', 'string', 'max:5000']]);

        $note = $ticket->notes()->create(['body' => $v['body']]);
        Activity::log($ticket, 'note_added', 'Note added through the API', actor: 'api');
        $ticket->touch();

        return response()->json(new NoteResource($note), 201);
    }

    private function rules(): array
    {
        return [
            'body' => ['nullable', 'string', 'max:10000'],
            'status' => [Rule::enum(TicketStatus::class)],
            'priority' => [Rule::enum(TicketPriority::class)],
            'type_id' => ['nullable', 'integer', $this->ours('ticket_types')],
            'contact_id' => ['nullable', 'integer', $this->ours('contacts', softDeletes: true)],
            'conversation_id' => ['nullable', 'integer', $this->ours('conversations')],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
        ];
    }
}
