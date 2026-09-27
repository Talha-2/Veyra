<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The agent harness, as configuration owned by the app layer.
 *
 * The agent layer runs this; it does not store it. An expert is a data record
 * (prompt + tools + skills + model), a skill is markdown discovered
 * progressively, and both are edited in Studio and read over the contract.
 *
 * `tool_calls` and `delegations` are the other half: not configuration but
 * evidence. They exist because the reliability rules in ARCHITECTURE.md §5.4 —
 * "the talker never promises a ticket without a completed, worker-confirmed
 * action" — are unfalsifiable without a record of what actually ran.
 */
return new class extends Migration
{
    public function up(): void
    {
        // A connected external account: Composio, a raw OAuth app, an API key,
        // or an MCP server.
        Schema::create('integrations', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('provider');            // composio | http | mcp
            $table->string('toolkit')->nullable(); // e.g. google_calendar, hubspot
            $table->string('label');
            $table->string('status')->default('disconnected'); // connected|disconnected|error

            $table->string('external_account_id')->nullable();
            // OAuth tokens and API keys. Encrypted via the model cast.
            $table->text('credentials')->nullable();
            $table->json('config')->nullable();

            $table->text('error')->nullable();
            $table->timestamp('connected_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status']);
        });

        // A group of actions an expert can be granted in one go, so permissions
        // are assigned in units a person can reason about ("Calendar") rather
        // than 40 individual tools.
        Schema::create('action_groups', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('integration_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('actions', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('action_group_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('integration_id')->nullable()->constrained()->cascadeOnDelete();

            // `kind` is the reliability-relevant distinction, not a label:
            //   internal — operates on this database through a service class.
            //              Transactional and idempotent by construction.
            //   http     — an outbound request to a third party. Can partially
            //              apply, time out after succeeding, and be retried into
            //              a duplicate.
            //   composio / mcp — same hazards, someone else's client.
            $table->string('kind');
            $table->string('slug');
            $table->string('name');
            $table->text('description');   // the LLM selects on this; it is product copy

            // JSON Schema for arguments, handed to the model as the tool schema.
            $table->json('parameters')->nullable();
            $table->json('config')->nullable();

            // Whether repeating this call with the same arguments is harmless.
            // The worker retries on transport failures, and a non-idempotent
            // action must instead be reconciled rather than blindly retried —
            // this is the flag that decides which.
            $table->boolean('is_idempotent')->default(false);

            // A durable write. `hangup_call` waits for these and only these; an
            // ordinary read left running costs nothing once the line is down.
            $table->boolean('is_durable_write')->default(false);

            // Require a human to approve before it executes.
            $table->boolean('requires_approval')->default(false);

            $table->unsignedInteger('timeout_ms')->default(15000);
            $table->unsignedTinyInteger('max_retries')->default(2);

            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->unique(['organization_id', 'slug']);
            $table->index(['organization_id', 'enabled']);
        });

        // An expert is a record, not a class. Built-ins are seeded with
        // is_builtin so Studio can show them without letting them be deleted.
        Schema::create('experts', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('slug');
            $table->string('name');
            $table->text('description');   // peer-routing uses this, one line each
            $table->longText('system_prompt')->nullable();

            $table->string('model')->nullable();
            $table->string('reasoning_effort')->nullable();

            // Which side of the call this expert serves. The talker runs a small
            // fast model and owns speech; the worker owns skills and writes.
            $table->string('runtime')->default('worker'); // talker | worker | text

            $table->boolean('is_builtin')->default(false);
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->unique(['organization_id', 'slug']);
        });

        // A skill is a markdown file: frontmatter + imperative prose. Discovery
        // is progressive — name and description go in the prompt, the body is
        // read only when it becomes relevant.
        Schema::create('skills', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('slug');
            $table->string('name');
            $table->text('description');   // what the model sees before reading the body
            $table->longText('body')->nullable();

            // per-skill, not global. ARCHITECTURE.md §8 risk 2: freeform markdown
            // is what the harness assumes, but a small model in an ungated loop
            // has a documented history of degenerating. A skill that needs
            // step-gating declares it and runs through the flow controller;
            // everything else runs as prose.
            $table->string('execution_mode')->default('prose'); // prose | gated

            // Ordered steps, only when execution_mode = gated. Null for prose.
            $table->json('steps')->nullable();

            $table->string('scope')->default('org'); // system | org | expert
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('version')->default(1);

            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['organization_id', 'slug']);
            $table->index(['organization_id', 'enabled']);
        });

        Schema::create('expert_skill', function (Blueprint $table) {
            $table->id();
            $table->foreignId('expert_id')->constrained()->cascadeOnDelete();
            $table->foreignId('skill_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['expert_id', 'skill_id']);
        });

        Schema::create('action_expert', function (Blueprint $table) {
            $table->id();
            $table->foreignId('expert_id')->constrained()->cascadeOnDelete();
            $table->foreignId('action_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['expert_id', 'action_id']);
        });

        // One talker -> worker handoff. The audit trail for the delegate()
        // protocol: what conversation was sent, what came back, how long it took.
        Schema::create('delegations', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('call_id')->constrained()->cascadeOnDelete();

            // Monotonic per call. A worker must never receive the same segment
            // twice; a duplicate sequence is the signal that it did.
            $table->unsignedInteger('sequence');

            // Exactly what was handed over: caller-facing turns only, no system
            // prompts and no tool plumbing.
            $table->text('transcript_delta');
            $table->text('reply')->nullable();

            $table->string('status')->default('running'); // running|completed|failed|timeout|aborted
            $table->text('error')->nullable();

            // The silent shutdown pass, which never speaks and runs once.
            $table->boolean('is_finalization')->default(false);

            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['call_id', 'sequence']);
            $table->index(['organization_id', 'status']);
        });

        // Every tool invocation, internal or external.
        //
        // This is the table that makes "the agent handles tool calls reliably"
        // checkable rather than asserted: what was called, with what, what came
        // back, how long it took, how many attempts it needed, and whether a
        // durable write completed.
        Schema::create('tool_calls', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->foreignId('action_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('call_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('delegation_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('expert_id')->nullable()->constrained()->nullOnDelete();

            // Kept as text as well as a foreign key: an action can be renamed or
            // deleted, and the history of what ran must survive it.
            $table->string('action_slug');
            $table->string('kind');

            $table->json('arguments')->nullable();
            $table->json('result')->nullable();

            $table->string('status'); // succeeded|failed|timeout|rejected|awaiting_approval
            $table->text('error')->nullable();

            $table->unsignedTinyInteger('attempt')->default(1);
            $table->unsignedInteger('duration_ms')->nullable();

            // Set for non-idempotent actions before dispatch, so a retry after an
            // ambiguous timeout can ask "did this already happen?" instead of
            // doing it twice.
            $table->string('idempotency_key')->nullable();

            $table->foreignId('approved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->timestamps();

            $table->index(['organization_id', 'created_at']);
            $table->index(['organization_id', 'status']);
            $table->index(['action_slug', 'status']);
            $table->unique(['organization_id', 'idempotency_key']);
        });

        // Deep-agent / Ask-Z threads for the Studio side panel.
        Schema::create('agent_threads', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->string('title')->nullable();
            // The agent's working state (todos, files) lives in the agent layer's
            // checkpointer keyed by external_id; this is the readable history.
            $table->string('external_id')->nullable();
            $table->json('messages')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_threads');
        Schema::dropIfExists('tool_calls');
        Schema::dropIfExists('delegations');
        Schema::dropIfExists('action_expert');
        Schema::dropIfExists('expert_skill');
        Schema::dropIfExists('skills');
        Schema::dropIfExists('experts');
        Schema::dropIfExists('actions');
        Schema::dropIfExists('action_groups');
        Schema::dropIfExists('integrations');
    }
};
