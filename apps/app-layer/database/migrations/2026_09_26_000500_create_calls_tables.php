<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Calls and their transcripts.
 *
 * A call is not a message — it has a duration, a recording, a live room and a
 * turn-by-turn transcript — so it keeps its own table, but it belongs to a
 * conversation so the inbox shows calls and texts on one timeline.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calls', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->foreignId('conversation_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('phone_number_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();

            $table->string('direction');   // inbound | outbound
            $table->string('from_number')->nullable();
            $table->string('to_number')->nullable();

            $table->string('provider')->nullable();
            $table->string('provider_sid')->nullable();
            // LiveKit room. The join key between the app layer and a live agent
            // session, and how a transcript finds its call.
            $table->string('room')->nullable();

            $table->string('status')->default('queued');
            $table->unsignedInteger('duration_sec')->default(0);
            $table->string('recording_url')->nullable();

            // Which language the call actually ran in, recorded rather than
            // assumed. Urdu calls run a different STT and TTS provider than
            // English ones (docs/urdu-support.md), so this is needed to make
            // sense of quality and latency numbers after the fact.
            $table->string('language')->nullable();

            // Did a human end up on this call? The handoff is a product feature,
            // so how often it fires is a number the business wants.
            $table->boolean('transferred')->default(false);
            $table->foreignId('transferred_to_id')->nullable()->constrained('users')->nullOnDelete();

            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'created_at']);
            $table->index(['organization_id', 'status']);
            $table->index('room');
            $table->unique(['provider', 'provider_sid']);
        });

        Schema::create('call_transcripts', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('call_id')->constrained()->cascadeOnDelete();

            // Turn list: [{role, text, ts, language}]. Append-only and read as a
            // whole, so a JSON document is the right shape — nothing queries
            // inside it.
            $table->json('items')->nullable();

            // Per-turn eou / ttft / ttfb aggregates published by the worker.
            // VOICE.md is explicit that p95 is the product, so these are kept
            // per call rather than averaged away at write time.
            $table->json('metrics')->nullable();

            $table->text('summary')->nullable();
            $table->timestamps();

            $table->unique('call_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('call_transcripts');
        Schema::dropIfExists('calls');
    }
};
