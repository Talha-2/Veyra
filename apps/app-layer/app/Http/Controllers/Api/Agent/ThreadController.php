<?php

namespace App\Http\Controllers\Api\Agent;

use App\Http\Controllers\Controller;
use App\Models\AgentThread;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The agent answers on an Ask thread.
 *
 * Replaces the pending placeholder the app wrote when the message was sent,
 * so the person sees one reply, not a "working…" bubble followed by the
 * answer. `external_id` is the agent layer's thread key and is stored on
 * first reply.
 */
class ThreadController extends Controller
{
    public function __invoke(Request $request, Organization $organization, AgentThread $thread): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['required', 'string', 'max:50000'],
            'external_id' => ['nullable', 'string', 'max:128'],
            'final' => ['boolean'],
        ]);

        $messages = $thread->messages ?? [];
        $last = array_key_last($messages);

        $reply = ['role' => 'assistant', 'content' => $validated['content'], 'at' => now()->toIso8601String()];
        if (! ($validated['final'] ?? true)) {
            $reply['pending'] = true;
        }

        if ($last !== null && ($messages[$last]['role'] ?? null) === 'assistant' && ($messages[$last]['pending'] ?? false)) {
            $messages[$last] = $reply;
        } else {
            $messages[] = $reply;
        }

        $thread->update(['messages' => $messages, 'external_id' => $validated['external_id'] ?? $thread->external_id]);

        return response()->json(['thread_id' => $thread->id, 'messages' => count($messages)]);
    }
}
