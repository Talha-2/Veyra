<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['diagnostic_orders', 'patient_documents', 'patient_referrals'] as $table) {
            Schema::create($table, function (Blueprint $t) use ($table) {
                $t->id();
                $t->organization();
                $t->foreignId('patient_id')->constrained()->restrictOnDelete();
                $t->foreignId('provider_id')->constrained()->restrictOnDelete();
                $t->foreignId('author_user_id')->constrained('users')->restrictOnDelete();
                $t->foreignId('clinical_encounter_id')->nullable()->constrained()->restrictOnDelete();
                $t->string('provider_name');
                $t->string('author_name');
                $t->unsignedInteger('version')->default(1);
                if ($table === 'diagnostic_orders') {
                    $t->string('kind');
                    $t->string('name');
                    $t->text('indication');
                    $t->string('priority')->default('routine');
                    $t->string('status')->default('draft');
                    $t->timestampTz('ordered_at')->nullable();
                    $t->text('result')->nullable();
                    $t->string('result_flag')->nullable();
                    $t->timestampTz('resulted_at')->nullable();
                    $t->foreignId('resulted_by')->nullable()->constrained('users')->restrictOnDelete();
                    $t->timestampTz('reviewed_at')->nullable();
                    $t->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
                    $t->text('review_note')->nullable();
                    $t->timestampTz('cancelled_at')->nullable();
                    $t->text('cancellation_reason')->nullable();
                    $t->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
                } elseif ($table === 'patient_documents') {
                    $t->string('title');
                    $t->string('category');
                    $t->string('original_name');
                    $t->string('storage_path');
                    $t->string('mime_type');
                    $t->unsignedBigInteger('size_bytes');
                    $t->string('sha256', 64);
                } else {
                    $t->string('recipient');
                    $t->text('reason');
                    $t->text('letter');
                    $t->string('status')->default('draft');
                    $t->timestampTz('issued_at')->nullable();
                    $t->foreignId('issued_by')->nullable()->constrained('users')->restrictOnDelete();
                    $t->timestampTz('revoked_at')->nullable();
                    $t->foreignId('revoked_by')->nullable()->constrained('users')->restrictOnDelete();
                    $t->text('revocation_reason')->nullable();
                }
                $t->timestamps();
                $t->index(['organization_id', 'patient_id', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_referrals');
        Schema::dropIfExists('patient_documents');
        Schema::dropIfExists('diagnostic_orders');
    }
};
