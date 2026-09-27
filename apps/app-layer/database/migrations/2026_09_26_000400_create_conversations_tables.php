<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The omnichannel inbox.
 *
 * Three deliberate departures from the schema this replaces:
 *
 * 1. **Identifiers.** A phone number, email address or web session is a thing in
 *    its own right, and it exists before we know who owns it. Adopted from Z360:
 *    anonymous communication is captured against an identifier and is linked to
 *    a contact later — at which point the whole history follows, because the
 *    conversations pointed at the identifier all along. The old schema matched
 *    on a `peer` string per channel and had no way to merge.
 *
 * 2. **Conversations are a real table, not a derived view.** Previously a thread
 *    was a projection over telephony rows, which is why "delete" and "assign"
 *    had no honest meaning. Now a conversation owns its messages.
 *
 * 3. **One `messages` table instead of five.** sms / web chat / email / fax were
 *    four near-identical tables the inbox had to UNION, each with its own thread
 *    key. Channel-specific fields are nullable columns plus `meta`. Calls stay
 *    separate — a call is not a message; it has duration, a recording and a
 *    transcript.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('identifiers', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('type');   // phone | email | web_session
            $table->string('value');
            $table->string('label')->nullable();

            // Null until someone (or something) matches this identifier to a
            // person. Linking it retroactively attaches every conversation.
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();

            $table->timestamps();

            $table->unique(['organization_id', 'type', 'value']);
            $table->index(['organization_id', 'contact_id']);
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->foreignId('identifier_id')->constrained()->cascadeOnDelete();
            // Denormalized from the identifier so the inbox list can filter and
            // sort by contact without joining through identifiers on every row.
            // Kept in step by the Identifier observer when a link is made.
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();

            $table->string('channel');            // call | sms | email | web_chat | fax
            $table->string('subject')->nullable(); // email only
            $table->string('status')->default('open'); // open | snoozed | closed
            $table->boolean('is_favorite')->default(false);
            $table->timestamp('snoozed_until')->nullable();

            // Sorting the inbox by recency is the single most common query in
            // the product; it must not require aggregating messages.
            $table->timestamp('last_message_at')->nullable();
            $table->unsignedInteger('unread_count')->default(0);

            $table->timestamps();

            $table->index(['organization_id', 'status', 'last_message_at']);
            $table->index(['organization_id', 'channel']);
            $table->index(['organization_id', 'is_favorite']);
        });

        // Assignment as a pivot rather than a JSON array of ids: "my inbox" is a
        // core view and it has to be a join, not a scan with a JSON predicate.
        Schema::create('conversation_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['conversation_id', 'user_id']);
            $table->index('user_id');
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();

            $table->string('channel');
            $table->string('direction');   // inbound | outbound
            $table->string('status')->default('received');

            // Who sent an outbound message: a user, or null for the AI agent.
            // "Did a human or the agent answer this?" is a question the Desk
            // asks constantly, so it is a column rather than a flag in meta.
            $table->foreignId('sent_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('from_agent')->default(false);

            $table->text('body')->nullable();
            $table->text('body_html')->nullable();

            $table->string('from_address')->nullable();
            $table->string('to_address')->nullable();

            // Provider message id — the dedupe key for webhook redelivery, which
            // every one of these providers does.
            $table->string('provider')->nullable();
            $table->string('provider_sid')->nullable();

            // Channel-specific extras: email cc/thread ids, fax page counts,
            // MMS media urls. Genuinely schemaless, so genuinely JSON.
            $table->json('meta')->nullable();

            $table->text('error')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
            $table->index(['organization_id', 'created_at']);
            // Partial-ish dedupe guard; provider_sid is null for internal notes.
            $table->unique(['provider', 'provider_sid']);
        });

        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();

            $table->string('disk')->default('local');
            $table->string('path');
            $table->string('filename');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversation_user');
        Schema::dropIfExists('conversations');
        Schema::dropIfExists('identifiers');
    }
};
