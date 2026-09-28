<?php

namespace App\Http\Controllers\Studio;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Enums\IdentifierType;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\AgentConfig;
use App\Models\Call;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Message;
use App\Models\Organization;
use App\Services\Agent\AgentGateway;
use App\Services\Agent\LiveChat;
use App\Services\LiveKit\AccessToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Talk — the customer-facing agent, tried from Studio, by voice or by chat.
 *
 * Not a demo path: a voice session is a real call row answered by the same
 * LiveKit voice worker that answers the phone (talker + worker, the same
 * skills, knowledge, memory, experts and actions); the only difference is
 * that the caller is a browser in a room the app created instead of a SIP
 * leg. A chat is a real web-chat conversation answered by the same worker
 * through the gateway. Both land in Desk like any customer's would, so what
 * the team tests is exactly what customers get.
 */
class TalkController extends Controller
{
    public function index(Request $request, AgentGateway $gateway): Response
    {
        $config = AgentConfig::query()->first();
        $identifier = $this->testerIdentifier($request);

        $chat = $request->integer('conversation')
            ? Conversation::query()->where('identifier_id', $identifier->id)->where('channel', Channel::WebChat)->find($request->integer('conversation'))
            : null;

        return Inertia::render('studio/talk', [
            'agent' => [
                'name' => $config?->display_name ?: 'Your agent',
                'greeting' => $config?->greeting,
            ],
            'voice_available' => AccessToken::configured(),
            'agent_available' => $gateway->available(),
            'chat' => $chat ? [
                'id' => $chat->id,
                'messages' => $chat->messages()->orderBy('id')->get()->map(fn (Message $m) => $this->messageRow($m))->all(),
            ] : null,
            'recent' => $this->recent($identifier),
        ]);
    }

    /**
     * Start a voice session: a call row waiting to be answered, a private
     * room, and a token for the browser. The voice worker is dispatched to
     * the room by LiveKit, claims the call by the room name, and answers.
     */
    public function voice(Request $request): JsonResponse
    {
        if (! AccessToken::configured()) {
            return response()->json(['message' => 'Voice needs LiveKit: set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.'], 503);
        }

        $identifier = $this->testerIdentifier($request);
        $config = AgentConfig::query()->first();
        $room = 'web-'.Organization::currentId().'-'.Str::lower(Str::random(20));

        // A session the agent never joined (the worker was down, the tab was
        // closed first) would otherwise say "ringing" in Desk forever. Past the
        // window in which the worker may still claim it, it was not answered.
        Call::query()->where('provider', 'web')->where('status', 'ringing')->where('created_at', '<', now()->subMinutes(15))
            ->update(['status' => 'failed', 'error' => 'Not answered: the voice agent did not join this browser session.']);

        $conversation = Conversation::query()
            ->where('identifier_id', $identifier->id)->where('channel', Channel::Call)->where('status', ConversationStatus::Open)
            ->latest('last_message_at')->first()
            ?? Conversation::create(['identifier_id' => $identifier->id, 'contact_id' => $identifier->contact_id, 'channel' => Channel::Call, 'status' => ConversationStatus::Open]);

        $call = Call::create([
            'conversation_id' => $conversation->id,
            'contact_id' => $identifier->contact_id,
            'direction' => 'inbound',
            'from_number' => $identifier->value,
            'to_number' => 'web',
            'provider' => 'web',
            'provider_sid' => $room,
            'room' => $room,
            'status' => 'ringing',
            'language' => $config?->primary_language ?: 'en',
        ]);
        $conversation->forceFill(['last_message_at' => now()])->save();

        $user = $request->user();
        $token = AccessToken::forRoom(
            room: $room,
            identity: 'studio-'.$user->getKey().'-'.Str::lower(Str::random(6)),
            name: $user->name,
            attributes: ['veyra.session' => 'studio-talk', 'veyra.call_id' => (string) $call->id],
            ttlSeconds: 2 * 3600,
        );

        return response()->json([
            'url' => config('services.livekit.url'),
            'token' => $token,
            'room' => $room,
            'call_id' => $call->id,
        ]);
    }

    /**
     * One chat turn with the customer-facing agent, streamed. The first event
     * names the conversation (created here when there is none).
     */
    public function chat(Request $request, LiveChat $chat): StreamedResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:5000'],
            'conversation_id' => ['nullable', 'integer'],
        ]);

        $identifier = $this->testerIdentifier($request);
        $conversation = ! empty($validated['conversation_id'])
            ? Conversation::query()->where('identifier_id', $identifier->id)->where('channel', Channel::WebChat)->findOrFail($validated['conversation_id'])
            : Conversation::create(['identifier_id' => $identifier->id, 'contact_id' => $identifier->contact_id, 'channel' => Channel::WebChat, 'status' => ConversationStatus::Open, 'subject' => 'Studio test chat']);
        $organization = Organization::current();

        return response()->stream(function () use ($chat, $conversation, $validated, $organization) {
            ignore_user_abort(true);
            Organization::setCurrent($organization);
            $send = function (array $event): void {
                echo 'data: '.json_encode($event, JSON_UNESCAPED_UNICODE)."\n\n";
                if (ob_get_level() > 0) {
                    @ob_flush();
                }
                flush();
            };
            $send(['type' => 'conversation', 'id' => $conversation->id]);
            try {
                $chat->reply($conversation, $validated['message'], $send);
            } finally {
                Organization::setCurrent(null);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * The person testing from Studio talks to the agent as a web visitor of
     * their own: one identifier per team member, so their test chats and calls
     * are grouped in Desk and never mixed with a real customer's history.
     */
    private function testerIdentifier(Request $request): Identifier
    {
        $user = $request->user();

        return Identifier::resolve(IdentifierType::WebSession, "Studio test · {$user->name} #{$user->getKey()}");
    }

    private function recent(Identifier $identifier): array
    {
        $calls = Call::query()->where('provider', 'web')->where('from_number', $identifier->value)->latest()->limit(6)->get()
            ->map(fn (Call $c) => ['kind' => 'voice', 'id' => $c->id, 'at' => $c->created_at?->toIso8601String(), 'status' => $c->status, 'duration' => $c->formattedDuration(), 'href' => "/desk/calls/{$c->id}"]);
        $chats = Conversation::query()->where('identifier_id', $identifier->id)->where('channel', Channel::WebChat)->latest('last_message_at')->limit(6)->get()
            ->map(fn (Conversation $c) => ['kind' => 'chat', 'id' => $c->id, 'at' => ($c->last_message_at ?? $c->created_at)?->toIso8601String(), 'status' => $c->status->value, 'duration' => null, 'href' => "/studio/talk?mode=chat&conversation={$c->id}"]);

        return $calls->concat($chats)->sortByDesc('at')->values()->take(8)->all();
    }

    private function messageRow(Message $m): array
    {
        return [
            'role' => $m->isInbound() ? 'user' : 'assistant',
            'content' => (string) $m->body,
            'at' => $m->created_at?->toIso8601String(),
            'parts' => $m->isInbound() ? null : [
                ...collect($m->meta['steps'] ?? [])->map(fn ($s) => ['type' => 'tool', ...$s])->all(),
                ['type' => 'text', 'text' => (string) $m->body],
            ],
        ];
    }
}
