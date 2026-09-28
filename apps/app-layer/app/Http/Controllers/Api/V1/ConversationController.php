<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Http\Resources\V1\ConversationResource;
use App\Http\Resources\V1\MessageResource;
use App\Http\Resources\V1\NoteResource;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Note;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Reading conversations and what is on them. Writing is MessageController. */
class ConversationController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $f = $this->check($request, [
            'status' => ['sometimes', Rule::enum(ConversationStatus::class)],
            'channel' => ['sometimes', Rule::enum(Channel::class)],
            'contact_id' => ['sometimes', 'integer'],
        ]);

        $query = Conversation::query()->with('identifier')
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['channel'] ?? null, fn ($q, $c) => $q->where('channel', $c))
            ->when($f['contact_id'] ?? null, fn ($q, $id) => $q->where('contact_id', $id));

        return $this->list($request, $query, ConversationResource::class);
    }

    public function show(Conversation $conversation): JsonResponse
    {
        return response()->json((new ConversationResource($conversation->load('identifier')))->withMessages());
    }

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        $f = $this->check($request, ['direction' => ['sometimes', Rule::in(['inbound', 'outbound'])]]);

        $query = Message::query()->where('conversation_id', $conversation->id)
            ->when($f['direction'] ?? null, fn ($q, $d) => $q->where('direction', $d));

        return $this->list($request, $query, MessageResource::class);
    }

    public function notes(Request $request, Conversation $conversation): JsonResponse
    {
        $query = Note::query()->with('author:id,name')
            ->where('notable_type', $conversation->getMorphClass())->where('notable_id', $conversation->id);

        return $this->list($request, $query, NoteResource::class);
    }
}
