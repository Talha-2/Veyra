<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('kind');
            $table->boolean('active')->default(true);
            foreach (['history', 'subjective', 'objective', 'assessment', 'plan'] as $field) {
                $table->text($field)->nullable();
            }
            $table->timestamps();
            $table->index(['organization_id', 'active']);
        });
        Schema::create('patient_questionnaires', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->json('questions');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('questionnaire_responses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('patient_questionnaire_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('recorder_name');
            $table->string('title');
            $table->json('questions');
            $table->json('answers');
            $table->timestamps();
            $table->index(['organization_id', 'patient_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('questionnaire_responses');
        Schema::dropIfExists('patient_questionnaires');
        Schema::dropIfExists('clinical_templates');
    }
};
