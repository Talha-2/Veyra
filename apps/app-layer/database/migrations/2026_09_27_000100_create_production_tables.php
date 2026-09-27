<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Everything the first pass left out, in one place.
 *
 * Reconciled against two sources: Z360's page tree (what a production version
 * of this product has) and the retired FastAPI server's routers (what this
 * product had before the rebuild). Each block names which of the two it came
 * from, so the reason a table exists is not lost.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── Inbox depth (Z360: inbox/context, chat/message-pinned, feedback-actions) ──

        Schema::table('identifiers', function (Blueprint $table) {
            // Block and do-not-disturb live on the identifier, not the contact:
            // you block a number, and a contact may have several.
            $table->timestamp('blocked_at')->nullable()->after('contact_id');
            $table->timestamp('dnd_until')->nullable()->after('blocked_at');
        });

        Schema::table('contacts', function (Blueprint $table) {
            $table->boolean('is_favorite')->default(false)->after('stage');
            $table->string('avatar_color')->nullable()->after('is_favorite');
            $table->index(['organization_id', 'is_favorite']);
        });

        // Server-side, per user. Z360 keeps pins in localStorage, which loses
        // them across devices and makes "what did the team flag" unanswerable.
        Schema::create('message_pins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['message_id', 'user_id']);
        });

        // Thumbs on agent messages. This is the cheapest training signal the
        // product has: an operator reading a thread already knows whether the
        // agent's reply was right.
        Schema::create('message_feedback', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('rating'); // up | down
            $table->text('comment')->nullable();
            $table->timestamps();
            $table->unique(['message_id', 'user_id']);
            $table->index(['organization_id', 'rating']);
        });

        // Saved views for every list surface: inbox, tickets, contacts, leads.
        // Server-side so a view a lead builds can be shared with the team.
        Schema::create('saved_views', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('surface');   // inbox | tickets | contacts | leads
            $table->string('name');
            $table->json('filters');
            $table->json('sort')->nullable();
            $table->boolean('is_shared')->default(false);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->index(['organization_id', 'surface']);
        });

        // ── Activity log (Z360: activities table, identifier-details-sidebar) ──

        // Who did what to a contact / conversation / ticket / lead. The agent
        // is an actor here too (user_id null, actor "agent"), which is what lets
        // a timeline show "agent booked appointment" next to "Sam closed ticket".
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->morphs('subject');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('actor')->default('user'); // user | agent | system
            $table->string('type');                   // created | assigned | stage_changed | note_added | …
            $table->string('description');
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'created_at']);
        });

        // ── Tickets (Z360: settings/product/tickets/types) ──

        Schema::create('ticket_types', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('name');
            $table->string('color')->default('#71717a');
            $table->text('description')->nullable();
            // Who a new ticket of this type goes to by default; the agent uses
            // this too, so a "Billing" ticket it raises lands with billing.
            $table->json('default_assignee_ids')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->unique(['organization_id', 'name']);
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->foreignId('ticket_type_id')->nullable()->after('type')->constrained()->nullOnDelete();
            // Kanban ordering within a status column.
            $table->unsignedInteger('position')->default(0)->after('priority');
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->unsignedInteger('position')->default(0)->after('pipeline_stage_id');
        });

        // ── Automations (old server: experts/models.py — Expert + ExpertRun) ──

        // The old "Expert" was this: a declaratively configured agent with a
        // goal, a tool allow-list and one or more triggers, running on a
        // schedule, on a webhook, or on an app event. It is a different thing
        // from the harness Expert (talker/worker), so it gets its own table and
        // its own name — the one Z360 uses.
        Schema::create('automations', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('name');
            $table->text('description')->nullable();
            $table->longText('system_prompt')->nullable();
            // The task, for schedule and webhook runs.
            $table->text('goal')->nullable();

            // ['schedule', 'webhook', 'app_event', 'manual']
            $table->json('triggers');
            // {kind: daily|hourly|weekly|interval, at, weekday, interval_minutes, tz}
            $table->json('schedule')->nullable();
            // {integration_id, toolkit, slug, name, config} for an app event
            $table->json('app_trigger')->nullable();
            $table->string('app_trigger_instance')->nullable();
            $table->string('webhook_secret')->nullable();

            $table->string('reasoning')->default('balanced'); // fast | balanced | deep
            // Which actions it may call. A subset of `actions`, by id.
            $table->json('allowed_action_ids')->nullable();
            $table->boolean('can_search_knowledge')->default(true);

            $table->boolean('enabled')->default(false);
            $table->timestamp('next_run_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['organization_id', 'enabled', 'next_run_at']);
        });

        Schema::create('automation_runs', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('automation_id')->constrained()->cascadeOnDelete();

            $table->string('trigger');  // manual | schedule | webhook | app_event
            $table->string('status')->default('running'); // running | done | error
            $table->text('input')->nullable();
            $table->longText('result')->nullable();
            // [{type: thought|tool_call|tool_result|final, ...}] — read whole.
            $table->json('steps')->nullable();
            $table->text('error')->nullable();
            $table->unsignedInteger('tokens')->default(0);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['automation_id', 'created_at']);
            $table->index(['organization_id', 'status']);
        });

        // ── Developer surface (old server: developer.py, publicapi/) ──

        Schema::create('api_keys', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('name');
            // Display prefix like "vy_sk_live_ab12…"; the secret is never stored.
            $table->string('prefix');
            $table->string('key_hash')->unique();
            $table->json('scopes');
            $table->boolean('publishable')->default(false);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('webhook_endpoints', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('url');
            $table->text('secret'); // encrypted
            // ['*'] or a list from the event catalog.
            $table->json('events');
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_delivered_at')->nullable();
            $table->unsignedInteger('consecutive_failures')->default(0);
            $table->timestamps();
        });

        Schema::create('webhook_deliveries', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('webhook_endpoint_id')->constrained()->cascadeOnDelete();
            $table->string('event');
            $table->json('payload');
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->text('response_body')->nullable();
            $table->unsignedTinyInteger('attempt')->default(1);
            $table->string('status'); // delivered | failed | pending
            $table->timestamps();
            $table->index(['webhook_endpoint_id', 'created_at']);
        });

        // ── Team (Z360: settings/account/team-security/invitations) ──

        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('email');
            $table->string('role');
            $table->json('surfaces');
            $table->string('token')->unique();
            $table->foreignId('invited_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'email']);
        });

        // ── Notifications (Z360: notifications page, user_notification_preferences) ──

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            // json, not the framework's default text: the inbox filters on
            // data->organization_id, and Postgres has no ->> for text.
            $table->json('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            // {event: {in_app: bool, email: bool}}
            $table->json('channels');
            $table->timestamps();
            $table->unique(['user_id', 'organization_id']);
        });

        // ── Email channel (old server: desk_email.py; Z360: authenticated_emails) ──

        Schema::create('email_accounts', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('provider');   // gmail | outlook
            $table->string('address');
            $table->string('from_name')->nullable();
            $table->text('credentials')->nullable(); // encrypted
            $table->string('status')->default('disconnected');
            $table->json('default_assignee_ids')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'address']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_accounts');
        Schema::dropIfExists('notification_preferences');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('invitations');
        Schema::dropIfExists('webhook_deliveries');
        Schema::dropIfExists('webhook_endpoints');
        Schema::dropIfExists('api_keys');
        Schema::dropIfExists('automation_runs');
        Schema::dropIfExists('automations');
        Schema::table('leads', fn (Blueprint $t) => $t->dropColumn('position'));
        Schema::table('tickets', function (Blueprint $t) {
            $t->dropConstrainedForeignId('ticket_type_id');
            $t->dropColumn('position');
        });
        Schema::dropIfExists('ticket_types');
        Schema::dropIfExists('activities');
        Schema::dropIfExists('saved_views');
        Schema::dropIfExists('message_feedback');
        Schema::dropIfExists('message_pins');
        Schema::table('contacts', fn (Blueprint $t) => $t->dropColumn(['is_favorite', 'avatar_color']));
        Schema::table('identifiers', fn (Blueprint $t) => $t->dropColumn(['blocked_at', 'dnd_until']));
    }
};
