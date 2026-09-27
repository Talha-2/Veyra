<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->organization();

            // Human-facing reference, unique per tenant: "#1042". Support staff
            // and customers quote these; a global autoincrement id would leak
            // how many tickets every other tenant has.
            $table->unsignedInteger('number');

            $table->string('subject');
            $table->text('body')->nullable();

            $table->string('status')->default('open');
            $table->string('priority')->default('normal');
            $table->string('type')->nullable();

            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('conversation_id')->nullable()->constrained()->nullOnDelete();

            // Null creator = the agent opened it. This is the row that proves a
            // worker actually performed the action it reported, so it must be
            // possible to tell agent-created tickets from human ones.
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('created_by_agent')->default(false);

            $table->string('channel')->default('manual');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['organization_id', 'number']);
            $table->index(['organization_id', 'status', 'updated_at']);
            $table->index(['organization_id', 'priority']);
        });

        Schema::create('ticket_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['ticket_id', 'user_id']);
            $table->index('user_id');
        });

        Schema::create('pipelines', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('name');
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->index(['organization_id', 'is_default']);
        });

        // Stages were a JSON array on the pipeline, so a lead's stage was a
        // free string that nothing validated and renaming a stage orphaned every
        // lead in it. A row with a foreign key fixes both.
        Schema::create('pipeline_stages', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('pipeline_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('color')->default('#71717a');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index(['pipeline_id', 'position']);
        });

        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->foreignId('pipeline_id')->constrained()->cascadeOnDelete();
            $table->foreignId('pipeline_stage_id')->nullable()->constrained()->nullOnDelete();

            $table->string('source')->default('manual');
            $table->unsignedBigInteger('value')->default(0);
            $table->timestamp('next_response_at')->nullable();
            $table->text('outreach_note')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['organization_id', 'pipeline_stage_id']);
            $table->index(['organization_id', 'next_response_at']);
        });

        Schema::create('lead_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['lead_id', 'user_id']);
        });

        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->organization();
            // Polymorphic: contacts need notes, but so do tickets and leads, and
            // three near-identical tables is how the old schema grew.
            $table->morphs('notable');
            $table->text('body');
            $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('reminders', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->morphs('remindable');
            $table->string('text');
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'due_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reminders');
        Schema::dropIfExists('notes');
        Schema::dropIfExists('lead_user');
        Schema::dropIfExists('leads');
        Schema::dropIfExists('pipeline_stages');
        Schema::dropIfExists('pipelines');
        Schema::dropIfExists('ticket_user');
        Schema::dropIfExists('tickets');
    }
};
