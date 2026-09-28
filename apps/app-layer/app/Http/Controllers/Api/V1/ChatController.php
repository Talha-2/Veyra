<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\Channel;
use App\Enums\IdentifierType;
use App\Http\Resources\V1\MessageResource;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Organization;
use App\Services\Agent\LiveChat;
use App\Support\PublicApi\ApiError;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Agent chat: your website or app talks to your agent.
 *
 * The same agent that answers your phone and Studio's Talk, with the same
 * skills, knowledge, memory and actions. Every chat is a web-chat
 * conversation in Desk, so your team sees it and can reply there; replies
 * written in Desk appear in `GET …/messages`.
 *
 * A session belongs to one visitor. Publishable keys run in the visitor's
 * browser, so they must present the session's `session_token` (returned once,
 * when the session is created) on every later call — without it, anyone with
 * the page's key could read someone else's chat. Server keys may skip it.
 */
class ChatController extends ApiController
{
    public function __construct(private LiveChat $chat) {}

    public function store(Request $request): JsonResponse
    {
        $validated = $this->check($request, [
            'visitor' => ['required', 'array'],
            'visitor.id' => ['required', 'string', 'max:128'],
            'visitor.name' => ['nullable', 'string', 'max:120'],
            'visitor.email' => ['nullable', 'email', 'max:190'],
            'visitor.phone' => ['nullable', 'string', 'max:40'],
        ]);
        $visitor = $validated['visitor'];

        $identifier = Identifier::resolve(IdentifierType::WebSession, 'api:'.$visitor['id']);
        // Recognise a returning customer by what they told you about them.
        if (! $identifier->contact_id) {
            $contact = Contact::query()
                ->when($visitor['email'] ?? null, fn ($q, $e) => $q->orWhereRaw('lower(email) = ?', [mb_strtolower($e)]))
                ->when($visitor['phone'] ?? null, fn ($q, $p) => $q->orWhere('phone', IdentifierType::Phone->normalize($p)))
                ->when(! ($visitor['email'] ?? null) && ! ($visitor['phone'] ?? null), fn ($q) => $q->whereRaw('1 = 0'))
                ->first();
            if ($contact) {
                $identifier->linkTo($contact);
            }
        }

        $conversation = $this->chat->conversationFor($identifier->refresh(), 'Website chat');

        return response()->json($this->session($conversation, $visitor, withToken: true), $conversation->wasRecentlyCreated ? 201 : 200);
    }

    public function show(Request $request, int $session): JsonResponse
    {
        $conversation = $this->authorized($request, $session);

        return response()->json($this->session($conversation));
    }

    public function messages(Request $request, int $session): JsonResponse
    {
        $conversation = $this->authorized($request, $session);

        return $this->list($request, $conversation->messages()->getQuery(), MessageResource::class);
    }

    /**
     * Send the visitor's message and get the agent's reply. With
     * `"stream": true` (or `Accept: text/event-stream`) the reply streams as
     * server-sent events — `status`, `tool`, `delta`, then `message` with the
     * stored reply, or `error`. Otherwise the call waits and returns JSON.
     */
    public function send(Request $request, int $session): JsonResponse|StreamedResponse
    {
        $conversation = $this->authorized($request, $session);
        $validated = $this->check($request, [
            'message' => ['required', 'string', 'max:5000'],
            'stream' => ['sometimes', 'boolean'],
        ]);
        $stream = ($validated['stream'] ?? false) || str_contains((string) $request->header('Accept'), 'text/event-stream');

        if ($stream) {
            $organization = Organization::current();

            return response()->stream(function () use ($conversation, $validated, $organization, $request) {
                ignore_user_abort(true);
                Organization::setCurrent($organization);
                $send = function (array $event): void {
                    echo 'data: '.json_encode($event, JSON_UNESCAPED_UNICODE)."\n\n";
                    if (ob_get_level() > 0) {
                        @ob_flush();
                    }
                    flush();
                };
                try {
                    $result = $this->chat->reply($conversation, $validated['message'], $send);
                    if ($result['reply']) {
                        $send(['type' => 'message', 'message' => (new MessageResource($result['reply']))->resolve($request)]);
                    }
                } finally {
                    Organization::setCurrent(null);
                }
            }, 200, ['Content-Type' => 'text/event-stream', 'Cache-Control' => 'no-cache, no-transform', 'X-Accel-Buffering' => 'no']);
        }

        $result = $this->chat->reply($conversation, $validated['message'], fn () => null);
        if (! $result['reply']) {
            return ApiError::make(503, $result['turn']->error ?? 'The agent could not reply.', 'agent_unavailable', ['message_id' => $result['inbound']->id]);
        }

        return response()->json([
            'object' => 'chat_reply',
            'session_id' => $conversation->id,
            'message' => (new MessageResource($result['inbound']))->resolve($request),
            'reply' => (new MessageResource($result['reply']))->resolve($request),
            // What the agent did to answer: knowledge searches, lookups, actions.
            'steps' => collect($result['turn']->steps())->map(fn ($s) => array_intersect_key($s, array_flip(['name', 'label', 'detail', 'status', 'summary', 'ms'])))->values()->all(),
        ]);
    }

    /** A web-chat conversation of this organization; publishable keys must hold its token. */
    private function authorized(Request $request, int $id): Conversation
    {
        $conversation = Conversation::query()->where('channel', Channel::WebChat)->findOrFail($id);
        if ($this->key($request)->publishable) {
            $given = (string) ($request->header('X-Chat-Session-Token') ?? $request->input('session_token', ''));
            abort_unless(hash_equals(self::token($conversation), $given), 403, 'This chat session needs its session_token (header X-Chat-Session-Token).');
        }

        return $conversation;
    }

    public static function token(Conversation $conversation): string
    {
        return 'cs_'.substr(hash_hmac('sha256', 'chat-session:'.$conversation->id, (string) config('app.key')), 0, 40);
    }

    private function session(Conversation $conversation, array $visitor = [], bool $withToken = false): array
    {
        return array_filter([
            'id' => $conversation->id,
            'object' => 'chat_session',
            'conversation_id' => $conversation->id,
            'status' => $conversation->status->value,
            'contact_id' => $conversation->contact_id,
            'visitor' => $visitor ?: null,
            'session_token' => $withToken ? self::token($conversation) : null,
            'created_at' => $conversation->created_at?->toIso8601String(),
            'updated_at' => $conversation->updated_at?->toIso8601String(),
        ], fn ($v) => $v !== null);
    }
}
