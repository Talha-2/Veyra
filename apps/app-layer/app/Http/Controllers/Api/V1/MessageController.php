<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Http\Resources\V1\MessageResource;
use App\Http\Resources\V1\NoteResource;
use App\Models\Activity;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Message;
use App\Support\PublicApi\ApiError;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Writing onto conversations: outbound messages and internal notes.
 *
 * **An outbound message is recorded, not sent.** No SMS or email provider is
 * connected to the app layer yet, so a message created here appears in the
 * Desk thread with `status: "queued"` and stays queued. It is the same record
 * the Desk composer and the agent create, and it will go out once sending is
 * built — no change to this API needed.
 */
class MessageController extends ApiController
{
    /** The channels a message can be written on. Calls are placed, web chat needs a live visitor. */
    private const CHANNELS = ['sms', 'email'];

    public function store(Request $request): JsonResponse
    {
        $v = $this->check($request, [
            'channel' => ['required', Rule::in(self::CHANNELS)],
            'to' => ['required', 'string', 'max:255', ...($request->input('channel') === 'email' ? ['email'] : ['regex:/\d{3,}/'])],
            'body' => ['required', 'string', 'max:10000'],
            'subject' => ['nullable', 'string', 'max:200'],
        ]);

        $channel = Channel::from($v['channel']);
        $identifier = Identifier::resolve($channel->identifierType(), $v['to']);
        if ($refused = $this->refused($identifier)) {
            return $refused;
        }

        $message = DB::transaction(function () use ($identifier, $channel, $v) {
            $conversation = Conversation::query()
                ->where('identifier_id', $identifier->id)->where('channel', $channel)
                ->latest('last_message_at')->first()
                ?? Conversation::create(['identifier_id' => $identifier->id, 'contact_id' => $identifier->contact_id, 'channel' => $channel, 'status' => ConversationStatus::Open, 'subject' => $v['subject'] ?? null]);

            return $this->record($conversation, $v);
        });

        return response()->json(new MessageResource($message), 201);
    }

    public function storeOnConversation(Request $request, Conversation $conversation): JsonResponse
    {
        $v = $this->check($request, [
            'body' => ['required', 'string', 'max:10000'],
            'subject' => ['nullable', 'string', 'max:200'],
        ]);

        if (! in_array($conversation->channel->value, self::CHANNELS, true)) {
            return ApiError::make(422, "Messages cannot be written on a {$conversation->channel->label()} conversation. Use an SMS or email conversation, or POST /messages with a channel and address.", 'channel_not_supported');
        }
        if ($refused = $this->refused($conversation->identifier)) {
            return $refused;
        }

        $message = DB::transaction(fn () => $this->record($conversation, $v));

        return response()->json(new MessageResource($message), 201);
    }

    public function storeNote(Request $request, Conversation $conversation): JsonResponse
    {
        $v = $this->check($request, ['body' => ['required', 'string', 'max:5000']]);

        $note = $conversation->notes()->create(['organization_id' => $conversation->organization_id, 'body' => $v['body']]);
        Activity::log($conversation, 'note_added', 'Note added through the API', actor: 'api');

        return response()->json(new NoteResource($note), 201);
    }

    private function record(Conversation $conversation, array $v): Message
    {
        $message = Message::create([
            'conversation_id' => $conversation->id,
            'channel' => $conversation->channel,
            'direction' => 'outbound',
            'status' => 'queued',
            'from_agent' => false,
            'to_address' => $conversation->identifier->value,
            'body' => $v['body'],
            'meta' => array_filter(['subject' => $v['subject'] ?? null, 'source' => 'api']),
        ]);
        $conversation->touchLastMessage($message);
        Activity::log($conversation, 'message_queued', 'A '.$conversation->channel->label().' was recorded through the API', actor: 'api', meta: ['message_id' => $message->id]);

        return $message;
    }

    private function refused(?Identifier $identifier): ?JsonResponse
    {
        return match (true) {
            $identifier?->isBlocked() => ApiError::make(422, 'This address is blocked in Veyra. Unblock it in Desk before messaging it.', 'not_permitted'),
            $identifier?->isDnd() => ApiError::make(422, 'This address has do-not-disturb on until '.$identifier->dnd_until->toIso8601ZuluString().'.', 'not_permitted'),
            default => null,
        };
    }
}
