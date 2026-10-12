<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_encounters', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('patient_id')->constrained()->restrictOnDelete();
            $t->foreignId('provider_id')->constrained()->restrictOnDelete();
            $t->foreignId('author_user_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('appointment_id')->nullable()->constrained()->restrictOnDelete();
            $t->unique(['organization_id', 'appointment_id']);
            $t->string('provider_name');
            $t->string('author_name');
            $t->string('status')->default('draft');
            $t->unsignedInteger('version')->default(1);
            $t->timestampTz('occurred_at');
            $t->timestampTz('signed_at')->nullable();
            $t->text('chief_complaint')->nullable();
            $t->text('history')->nullable();
            $t->string('allergy_status')->default('not_reviewed');
            $t->text('allergies')->nullable();
            $t->json('vitals')->nullable();
            foreach (['subjective', 'objective', 'assessment', 'plan'] as $field) {
                $t->text($field)->nullable();
            }
            $t->timestamps();
            $t->index(['organization_id', 'patient_id', 'occurred_at']);
        });
        Schema::create('encounter_amendments', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('clinical_encounter_id')->constrained()->restrictOnDelete();
            $t->foreignId('author_user_id')->constrained('users')->restrictOnDelete();
            $t->string('author_name');
            $t->text('reason');
            $t->text('content');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('encounter_amendments');
        Schema::dropIfExists('clinical_encounters');
    }
};
