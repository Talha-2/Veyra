<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\EvalRun;
use Inertia\Inertia;
use Inertia\Response;

class EvalController extends Controller
{
    /** The simulated-caller personas VOICE.md §5–6 describe, offered as presets. */
    public const PERSONAS = [
        'polite' => 'Speaks in complete sentences and wants the happy path. The demo user.',
        'rambler' => 'Buries the question, changes their mind mid-call.',
        'interrupter' => 'Talks over the agent and expects it to remember what it was cut off saying.',
        'accent_heavy' => '18% simulated STT corruption. The agent must clarify, not confidently answer the wrong question.',
    ];

    public function index(): Response
    {
        return Inertia::render('studio/evals', [
            'runs' => EvalRun::query()
                ->with('startedBy:id,name')
                ->latest()
                ->limit(50)
                ->get()
                ->map(fn (EvalRun $r) => [
                    'id' => $r->id,
                    'name' => $r->name,
                    'status' => $r->status,
                    'scenario' => $r->scenario,
                    'persona' => $r->persona,
                    'language' => $r->language,
                    'p95_ms' => $r->p95VoiceToVoiceMs(),
                    'scores' => $r->scores,
                    'error' => $r->error,
                    'started_by' => $r->startedBy?->name,
                    'created_at' => $r->created_at?->toIso8601String(),
                ])->all(),
            'personas' => collect(self::PERSONAS)->map(fn ($d, $k) => ['key' => $k, 'description' => $d])->values()->all(),
            // Honest until phase 6 lands: runs are started through the agent
            // layer, which is not wired yet. The page says so rather than
            // offering a button that does nothing.
            'runner_available' => false,
        ]);
    }
}
