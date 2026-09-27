<?php

namespace App\Http\Controllers\Studio;

use App\Http\Controllers\Controller;
use App\Models\AgentConfig;
use App\Models\PhoneNumber;
use App\Models\TelephonyConfig;
use App\Models\User;
use App\Support\LanguageCapabilities;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class TelephonyController extends Controller
{
    public function index(): Response
    {
        $config = TelephonyConfig::query()->first();
        $agent = AgentConfig::query()->first();
        $languages = $agent?->languages() ?? ['en'];

        return Inertia::render('studio/telephony', [
            'provider' => $config?->provider,
            // Never the credentials themselves — only whether they are set.
            'configured' => (bool) $config?->credentials,
            // Which credential fields are stored (names only, never values),
            // so the form can say "saved" without echoing a secret back.
            'credential_keys' => array_keys($config?->credentials ?? []),
            // Whether a LiveKit SIP trunk has been provisioned for this tenant.
            // Without one, inbound calls to these numbers have nowhere to land.
            'sip_trunk' => filled($config?->livekit),
            'numbers' => PhoneNumber::query()
                ->with('assignedUser:id,name')
                ->withCount('calls')
                ->orderBy('e164')
                ->get()
                ->map(fn (PhoneNumber $n) => [
                    'id' => $n->id,
                    'e164' => $n->e164,
                    'friendly_name' => $n->friendly_name,
                    'country' => $n->country,
                    'capabilities' => $n->capabilities ?? [],
                    'assigned_user_id' => $n->assigned_user_id,
                    'assigned_user' => $n->assignedUser?->name,
                    'language' => $n->language,
                    'effective_language' => $n->effectiveLanguage(),
                    'language_degraded' => LanguageCapabilities::isDegraded($n->effectiveLanguage()),
                    'status' => $n->status,
                    'calls_count' => $n->calls_count,
                    'sms_autoreply' => (bool) $n->sms_autoreply,
                    'monthly_cost' => $n->monthly_cost,
                ])->all(),
            'team' => User::whereHas('memberships')->get(['id', 'name'])->all(),
            // Only languages the agent has been configured to accept can be
            // pinned to a line.
            'languages' => collect($languages)->mapWithKeys(fn ($c) => [$c => LanguageCapabilities::for($c)])->all(),
            'default_language' => $agent?->primary_language ?? 'en',
        ]);
    }

    public function updateNumber(Request $request, PhoneNumber $number): RedirectResponse
    {
        $agent = AgentConfig::query()->first();

        $validated = $request->validate([
            'friendly_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'assigned_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'language' => ['sometimes', 'nullable', Rule::in($agent?->languages() ?? ['en'])],
            'sms_autoreply' => ['sometimes', 'boolean'],
        ]);

        $number->fill($validated)->save();

        return back()->with('success', 'Number updated.');
    }

    public function updateProvider(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'provider' => ['required', Rule::in(['twilio', 'telnyx'])],
            'credentials' => ['required', 'array'],
            'credentials.*' => ['string', 'max:500'],
        ]);

        TelephonyConfig::query()->updateOrCreate([], $validated);

        return back()->with('success', 'Provider credentials saved.');
    }
}
