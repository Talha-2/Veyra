<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_problems', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('code', 80)->nullable();
            $t->date('onset_date')->nullable();
            $t->string('status')->default('active');
            $t->text('notes')->nullable();
            $t->unsignedInteger('version')->default(1);
            $t->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('resolved_at')->nullable();
            $t->timestamps();
        });
        Schema::create('patient_allergies', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $t->string('allergen');
            $t->string('reaction');
            $t->string('severity');
            $t->string('status')->default('active');
            $t->text('notes')->nullable();
            $t->text('inactive_reason')->nullable();
            $t->unsignedInteger('version')->default(1);
            $t->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('inactive_at')->nullable();
            $t->timestamps();
        });
        Schema::create('prescriptions', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $t->foreignId('provider_id')->constrained()->restrictOnDelete();
            $t->foreignId('author_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('encounter_id')->nullable()->constrained('clinical_encounters')->restrictOnDelete();
            $t->string('provider_name');
            $t->string('registration_number')->nullable();
            $t->string('status')->default('draft');
            $t->json('items');
            $t->json('allergy_review')->nullable();
            $t->unsignedInteger('version')->default(1);
            $t->timestamp('issued_at')->nullable();
            $t->timestamp('cancelled_at')->nullable();
            $t->text('cancel_reason')->nullable();
            $t->timestamps();
        });
        Schema::create('medication_administrations', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $t->foreignId('provider_id')->constrained()->restrictOnDelete();
            $t->foreignId('author_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('provider_name');
            $t->string('kind');
            $t->string('name');
            $t->string('dose');
            $t->string('route');
            $t->string('site')->nullable();
            $t->string('lot_number')->nullable();
            $t->date('expiry_date')->nullable();
            $t->timestamp('occurred_at');
            $t->date('next_due_date')->nullable();
            $t->text('notes')->nullable();
            $t->string('status')->default('recorded');
            $t->unsignedInteger('version')->default(1);
            $t->text('void_reason')->nullable();
            $t->timestamp('voided_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medication_administrations');
        Schema::dropIfExists('prescriptions');
        Schema::dropIfExists('patient_allergies');
        Schema::dropIfExists('patient_problems');
    }
};
