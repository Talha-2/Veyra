<?php

namespace App\Services\Agent;

use App\Models\Action;
use App\Models\AgentConfig;
use App\Models\BusinessProfile;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Document;
use App\Models\Expert;
use App\Models\Identifier;
use App\Models\Organization;
use App\Models\PhoneNumber;
use App\Models\Skill;
use App\Models\Ticket;
use App\Models\TicketType;
use App\Support\LanguageCapabilities;

/**
 * Everything the agent layer needs to run for one tenant, in one payload.
 *
 * Built once per call on the greeting path, so it is one round trip and no
 * more: the talker cannot say hello until it has its prompt, its language and
 * its voice, and every extra request here is dead air on a phone line. What
 * is *not* here is anything read progressively — skill bodies, knowledge,
 * contact history beyond a summary — because those cost context the talker
 * does not have.
 *
 * The same bundle, minus the `call` block, serves text runs and automations
 * through `GET /context`.
 */
class CallContextBuilder
{
    public const CONTRACT = 'v1';

    public function forOrganization(Organization $organization): array
    {
        // An organization that never went through onboarding (created by a
        // seeder, an import, the API) still answers with a working agent:
        // without experts the front desk has no worker to look anything up.
        if (! Expert::query()->exists()) {
            app(\App\Services\Organization\StarterAgent::class)->provision($organization);
        }

        $config = AgentConfig::query()->firstOrCreate([]);
        $profile = BusinessProfile::query()->firstOrCreate([]);

        // A row created just now carries only what was filled — nothing —
        // and none of the column defaults. Read it back so the first call a
        // brand-new tenant receives gets the same bundle as the second.
        if ($config->wasRecentlyCreated) {
            $config->refresh();
        }
        if ($profile->wasRecentlyCreated) {
            $profile->refresh();
        }

        return [
            'contract' => self::CONTRACT,
            'organization' => [
                'id' => $organization->id,
                'slug' => $organization->slug,
                'name' => $organization->name,
                'timezone' => $organization->timezone,
            ],
            'business' => $profile->only(['name', 'description', 'industry', 'timezone', 'website', 'address', 'hours', 'holidays']),
            'agent' => $this->agent($config),
            'experts' => $this->experts(),
            'skills' => $this->skillIndex(),
            'ticket_types' => TicketType::query()->where('enabled', true)->orderBy('position')->get(['id', 'name', 'description'])->all(),
            'memory' => Document::query()->where('source_type', 'agent')->orderBy('name')->get()
                ->map(fn (Document $d) => ['name' => $d->name, 'content' => $d->content])->all(),
        ];
    }

    /**
     * A call's bundle. `$line` is null for a browser session (Studio Talk):
     * there is no dialled number, so the line block describes the browser and
     * the language falls back to the agent's primary one.
     */
    public function forCall(Call $call, ?PhoneNumber $line, Identifier $identifier): array
    {
        $organization = Organization::current();
        $bundle = $this->forOrganization($organization);

        $language = $call->language ?: ($line?->effectiveLanguage() ?? $bundle['agent']['primary_language'] ?? 'en');

        return [
            ...$bundle,
            'call' => [
                'id' => $call->id,
                'conversation_id' => $call->conversation_id,
                'direction' => $call->direction,
                'from' => $call->from_number,
                'to' => $call->to_number,
                'room' => $call->room,
                'provider' => $call->provider,
                'provider_sid' => $call->provider_sid,
                // The language this call runs in — per line, not per tenant,
                // because Urdu STT is monolingual. See docs/urdu-support.md.
                'language' => $language,
                'capabilities' => LanguageCapabilities::for($language),
            ],
            'line' => $line ? [
                'id' => $line->id,
                'e164' => $line->e164,
                'friendly_name' => $line->friendly_name,
                'language' => $line->language,
                'ivr' => $line->ivr,
                'answered_by_agent' => $line->answeredByAgent(),
            ] : ['id' => 0, 'e164' => 'web', 'friendly_name' => 'Browser (Studio Talk)', 'language' => $language, 'ivr' => null, 'answered_by_agent' => true],
            'caller' => $this->caller($identifier),
        ];
    }

    /**
     * A text conversation's bundle for live chat: the tenant bundle plus who
     * the agent is talking to, with no call or line.
     */
    public function forConversation(\App\Models\Conversation $conversation): array
    {
        return [
            ...$this->forOrganization(Organization::current()),
            'conversation' => ['id' => $conversation->id, 'channel' => $conversation->channel->value],
            'caller' => $this->caller($conversation->identifier),
        ];
    }

    private function agent(AgentConfig $config): array
    {
        $languages = $config->languages();

        return [
            'display_name' => $config->display_name,
            'persona' => $config->persona,
            'greeting' => $config->greeting,
            'primary_language' => $config->primary_language,
            'languages' => collect($languages)->map(fn ($code) => ['code' => $code, ...(LanguageCapabilities::for($code) ?? [])])->all(),
            'voice' => [
                // Cartesia unless the tenant chose otherwise: it covers the
                // most languages at realtime latency and its key is the one
                // that is live (ElevenLabs is opt-in per tenant).
                'provider' => $config->voice_provider ?: 'cartesia',
                'id' => $config->voice_id,
                'model' => $config->advanced['tts_model'] ?? 'flash',
            ],
            'turn' => [
                'min_endpointing_ms' => $config->min_endpointing_ms,
                'min_interruption_ms' => $config->min_interruption_ms,
                'allow_interruptions' => $config->allow_interruptions,
                'semantic_turn_detection' => $config->semantic_turn_detection,
            ],
            'max_call_seconds' => $config->max_call_seconds,
            'record_calls' => $config->record_calls,
            // An empty PHP array encodes as a JSON list. Anything the contract
            // types as an object must be an object even when empty.
            'advanced' => $config->advanced ?: new \stdClass,
        ];
    }

    /**
     * Every enabled expert with what it needs to be swapped in: prompt, tool
     * schemas with their reliability flags, and the skill catalog (names and
     * descriptions only — bodies are read on demand via /skills/{slug}).
     */
    private function experts(): array
    {
        $experts = Expert::query()->enabled()->with(['skills' => fn ($q) => $q->where('enabled', true), 'actions' => fn ($q) => $q->where('enabled', true)])->orderBy('position')->orderBy('id')->get();

        return $experts->map(fn (Expert $e) => [
            'slug' => $e->slug,
            'name' => $e->name,
            'description' => $e->description,
            'runtime' => $e->runtime->value,
            'system_prompt' => $e->system_prompt,
            'model' => $e->model,
            'reasoning_effort' => $e->reasoning_effort,
            'skills' => $e->skills->map(fn (Skill $s) => [
                'slug' => $s->slug, 'name' => $s->name, 'description' => $s->description,
                'path' => "/skills/org/{$s->slug}/SKILL.md", 'version' => $s->version, 'execution_mode' => $s->execution_mode->value,
            ])->values()->all(),
            'tools' => $e->actions->map(fn (Action $a) => $this->tool($a))->values()->all(),
            // Peer routing: one line per sibling on the same runtime.
            'peers' => $experts->where('runtime', $e->runtime)->where('id', '!=', $e->id)->map(fn (Expert $p) => $p->routingLine())->values()->all(),
        ])->values()->all();
    }

    private function tool(Action $a): array
    {
        return [
            ...$a->toToolSchema(),
            'id' => $a->id,
            'kind' => $a->kind->value,
            'is_idempotent' => $a->is_idempotent,
            'is_durable_write' => $a->is_durable_write,
            'requires_approval' => $a->requires_approval,
            'timeout_ms' => $a->timeout_ms,
            'max_retries' => $a->max_retries,
            'config' => $a->kind->isExternal() ? ($a->config ?: new \stdClass) : null,
        ];
    }

    private function skillIndex(): array
    {
        return Skill::query()->enabled()->orderBy('name')->get()
            ->map(fn (Skill $s) => ['slug' => $s->slug, 'name' => $s->name, 'description' => $s->description, 'version' => $s->version, 'scope' => $s->scope])
            ->all();
    }

    /**
     * Who is calling, as far as we know, plus a summary of history the worker
     * can use *before* asking the caller anything — the first reliability rule.
     */
    private function caller(Identifier $identifier): array
    {
        $contact = $identifier->contact;

        return [
            'identifier' => [
                'id' => $identifier->id,
                'type' => $identifier->type->value,
                'value' => $identifier->value,
                'blocked' => $identifier->isBlocked(),
                'dnd' => $identifier->isDnd(),
            ],
            'contact' => $contact ? $this->contact($contact) : null,
            'open_tickets' => $contact
                ? Ticket::query()->where('contact_id', $contact->id)->unresolved()->latest()->limit(3)->get()
                    ->map(fn (Ticket $t) => ['reference' => $t->reference(), 'subject' => $t->subject, 'status' => $t->status->value, 'created_at' => $t->created_at?->toIso8601String()])->all()
                : [],
            'recent_calls' => $contact
                ? Call::query()->where('contact_id', $contact->id)->completed()->with('transcript:id,call_id,summary')->latest()->limit(3)->get()
                    ->map(fn (Call $c) => ['at' => $c->created_at?->toIso8601String(), 'duration' => $c->formattedDuration(), 'summary' => $c->transcript?->summary])->all()
                : [],
        ];
    }

    public function contact(Contact $contact): array
    {
        return [
            'id' => $contact->id,
            'name' => $contact->name,
            'display_name' => $contact->displayName(),
            'phone' => $contact->phone,
            'email' => $contact->email,
            'company' => $contact->company,
            'stage' => $contact->stage?->value,
        ];
    }
}
