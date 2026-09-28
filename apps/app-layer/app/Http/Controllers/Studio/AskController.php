<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\AgentConfig;
use App\Models\AgentThread;
use App\Models\Organization;
use App\Services\Agent\AgentGateway;
use App\Services\Agent\AgentUnavailable;
use App\Services\Agent\StreamedTurn;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Ask — the deep-agent chat. Z360 calls it Ask Z.
 *
 * A turn streams: the browser posts to `stream`, this controller opens a
 * server-sent-event stream to the agent gateway and relays every event —
 * status, tokens, tool steps — as it arrives, then writes the finished turn
 * to the thread. The thread in the app is the readable history; the agent's
 * working state lives in the agent layer.
 */
class AskController extends Controller
{
    public function index(Request $request, AgentGateway $gateway, ?AgentThread $thread = null): Response
    {
        abort_if($thread?->exists && $thread->user_id !== $request->user()->getKey(), 404);

        $threads = AgentThread::query()->where('user_id', $request->user()->getKey())->latest('updated_at')->limit(80)->get();
        $config = AgentConfig::query()->first();

        return Inertia::render('studio/ask', [
            'threads' => $threads->map(fn (AgentThread $t) => [
                'id' => $t->id,
                'title' => $t->title ?: 'Untitled',
                'updated_at' => $t->updated_at?->toIso8601String(),
                'preview' => str(collect($t->messages ?? [])->last()['content'] ?? '')->squish()->limit(90)->value(),
            ])->all(),
            'thread' => $thread?->exists ? [
                'id' => $thread->id,
                'title' => $thread->title,
                'messages' => $thread->messages ?? [],
            ] : null,
            'agent_available' => $gateway->available(),
            'model' => $config?->advanced['worker_model'] ?? ($gateway->capabilities()['defaults']['worker'] ?? null),
            'prefill' => $thread?->exists ? null : $request->query('q'),
            'user_first_name' => str($request->user()->name)->before(' ')->value(),
        ]);
    }

    /**
     * Stream one turn. The first event names the thread (created here when
     * there is none), so the page can move its URL before the first token.
     */
    public function stream(Request $request, AgentGateway $gateway): StreamedResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:20000'],
            'thread_id' => ['nullable', 'integer'],
        ]);

        $user = $request->user();
        $thread = ! empty($validated['thread_id'])
            ? AgentThread::query()->where('user_id', $user->getKey())->findOrFail($validated['thread_id'])
            : AgentThread::create(['user_id' => $user->getKey(), 'title' => $this->titleFor($validated['message']), 'messages' => []]);

        // The history the agent continues from: finished turns only.
        $history = collect($thread->messages ?? [])
            ->filter(fn ($m) => in_array($m['role'] ?? '', ['user', 'assistant'], true) && ! ($m['pending'] ?? false) && ! ($m['error'] ?? false) && filled($m['content'] ?? ''))
            ->map(fn ($m) => ['role' => $m['role'], 'content' => $m['content']])
            ->values()->all();

        $messages = $thread->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $validated['message'], 'at' => now()->toIso8601String()];
        $thread->update(['messages' => $messages]);

        $organization = Organization::current();

        return response()->stream(function () use ($gateway, $thread, $validated, $history, $organization) {
            // Keep going after the person closes the tab: the turn still gets saved.
            ignore_user_abort(true);
            Organization::setCurrent($organization);

            $send = function (array $event): void {
                echo 'data: '.json_encode($event, JSON_UNESCAPED_UNICODE)."\n\n";
                if (ob_get_level() > 0) {
                    @ob_flush();
                }
                flush();
            };

            $send(['type' => 'thread', 'id' => $thread->id, 'title' => $thread->title]);

            $turn = new StreamedTurn;
            try {
                $body = $gateway->streamThread($thread, $validated['message'], $history);
            } catch (AgentUnavailable $e) {
                $turn->fail('The agent layer is not connected, so this could not be answered. Your message is saved on the thread.');
                $send(['type' => 'error', 'message' => $turn->error]);
                $this->save($thread, $turn);
                Organization::setCurrent(null);

                return;
            }

            $turn->relay($body, $send);

            $this->save($thread, $turn);
            Organization::setCurrent(null);
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /** Non-streaming fallback: record the message and push the run; the reply arrives through the contract. */
    public function send(Request $request, AgentGateway $gateway, ?AgentThread $thread = null): RedirectResponse
    {
        $validated = $request->validate(['message' => ['required', 'string', 'max:20000']]);

        if (! $thread?->exists) {
            $thread = AgentThread::create(['user_id' => $request->user()->getKey(), 'title' => $this->titleFor($validated['message']), 'messages' => []]);
        }
        abort_unless($thread->user_id === $request->user()->getKey(), 404);

        $messages = $thread->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $validated['message'], 'at' => now()->toIso8601String()];

        try {
            $handle = $gateway->startThreadRun($thread, $validated['message']);
            $messages[] = ['role' => 'assistant', 'content' => '', 'at' => now()->toIso8601String(), 'pending' => true];
            $thread->update(['messages' => $messages, 'external_id' => $handle['external_id'] ?? $thread->external_id]);
        } catch (AgentUnavailable) {
            // The honest placeholder, not a canned answer that looks real.
            $messages[] = [
                'role' => 'assistant',
                'content' => 'The agent layer is not connected, so I cannot act on this yet. Your message is saved on this thread and will be answered once it is.',
                'at' => now()->toIso8601String(),
                'pending' => true,
            ];
            $thread->update(['messages' => $messages]);
        }

        return redirect()->route('studio.ask.show', $thread);
    }

    public function rename(Request $request, AgentThread $thread): RedirectResponse
    {
        abort_unless($thread->user_id === $request->user()->getKey(), 403);
        $thread->update($request->validate(['title' => ['required', 'string', 'max:120']]));

        return back();
    }

    public function destroy(Request $request, AgentThread $thread): RedirectResponse
    {
        abort_unless($thread->user_id === $request->user()->getKey(), 403);
        $thread->delete();

        // Deleting the open chat leaves a new one; deleting another from the list stays put.
        $open = str_ends_with((string) parse_url(url()->previous(), PHP_URL_PATH), "/studio/ask/{$thread->id}");

        return $open ? redirect()->route('studio.ask') : back();
    }

    private function save(AgentThread $thread, StreamedTurn $turn): void
    {
        $thread->refresh();
        $messages = $thread->messages ?? [];
        $messages[] = $turn->toMessage();
        $thread->update(['messages' => $messages]);
    }

    /** A title from the first message: its first sentence, trimmed to a line. */
    private function titleFor(string $message): string
    {
        $first = preg_split('/(?<=[.?!])\s/', trim($message))[0] ?? $message;

        return str($first)->squish()->limit(60)->value();
    }
}
