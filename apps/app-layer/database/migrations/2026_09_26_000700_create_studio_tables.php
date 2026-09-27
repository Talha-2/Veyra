<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Who the agent works for. Injected into the system prompt on every
        // call, which is why it is separate from the knowledge base: these are
        // facts the agent must always hold, not material it looks up.
        Schema::create('business_profiles', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('name')->nullable();
            $table->text('description')->nullable();
            $table->string('industry')->nullable();
            $table->string('timezone')->default('UTC');
            $table->string('website')->nullable();
            $table->text('address')->nullable();

            // [{day, opens, closes, closed}] — read as a whole to decide "are we
            // open right now", never queried into.
            $table->json('hours')->nullable();
            $table->json('holidays')->nullable();

            $table->timestamps();
            $table->unique('organization_id');
        });

        // How the agent sounds and behaves. One row per tenant.
        Schema::create('agent_configs', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('display_name')->default('Assistant');
            $table->text('persona')->nullable();
            $table->text('greeting')->nullable();

            // Primary language, and the others it will accept. Urdu cannot be
            // served by the same STT/TTS pair as English, so the agent layer
            // resolves providers from this rather than being told which vendor
            // to use — see docs/urdu-support.md.
            $table->string('primary_language')->default('en');
            $table->json('additional_languages')->nullable();

            $table->string('voice_id')->nullable();
            $table->string('voice_provider')->nullable();

            // Conversation tuning. Named columns rather than a config blob
            // because Studio renders a control per setting and evals sweep them.
            $table->unsignedInteger('min_endpointing_ms')->default(400);
            $table->unsignedInteger('min_interruption_ms')->default(550);
            $table->boolean('allow_interruptions')->default(true);
            $table->boolean('semantic_turn_detection')->default(true);

            $table->unsignedInteger('max_call_seconds')->default(1800);
            $table->boolean('record_calls')->default(true);

            // Everything genuinely experimental or provider-specific.
            $table->json('advanced')->nullable();

            $table->timestamps();
            $table->unique('organization_id');
        });

        Schema::create('folders', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('name');
            $table->foreignId('parent_id')->nullable()->constrained('folders')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'parent_id']);
        });

        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('folder_id')->nullable()->constrained()->nullOnDelete();

            $table->string('name');
            $table->string('source_type')->default('upload'); // upload|created|agent|scrape
            $table->string('source_url')->nullable();
            $table->string('mime')->default('text/plain');
            $table->unsignedBigInteger('size_bytes')->default(0);

            $table->string('status')->default('processing'); // processing|ready|error
            $table->text('error')->nullable();

            // Extracted plain text — the source of truth for retrieval.
            $table->longText('content')->nullable();
            // HTML from the rich editor, so a created document can be re-edited
            // without round-tripping through the extracted text and losing
            // formatting.
            $table->longText('content_rich')->nullable();

            $table->unsignedInteger('chunk_count')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['organization_id', 'status']);
        });

        // Chunks live in the app layer even though the agent layer does the
        // retrieval: the app owns all data, and the agent reads them over the
        // contract. Embeddings are stored by the agent layer's vector store,
        // keyed by chunk id.
        Schema::create('document_chunks', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('position');
            $table->text('content');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['document_id', 'position']);
        });

        Schema::create('eval_runs', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('name')->nullable();
            $table->string('status')->default('running'); // running|done|error
            $table->string('scenario')->nullable();
            $table->string('persona')->nullable();
            $table->string('language')->default('en');

            $table->json('turns')->nullable();
            $table->json('scores')->nullable();
            // p50/p95 per stage. VOICE.md: p95 is the product, p50 is the demo.
            $table->json('latency')->nullable();

            $table->text('error')->nullable();
            $table->foreignId('started_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('eval_runs');
        Schema::dropIfExists('document_chunks');
        Schema::dropIfExists('documents');
        Schema::dropIfExists('folders');
        Schema::dropIfExists('agent_configs');
        Schema::dropIfExists('business_profiles');
    }
};
