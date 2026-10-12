<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_referrals', function (Blueprint $table) {
            $table->string('coordination_status')->default('pending');
            $table->date('scheduled_on')->nullable();
        });
        Schema::create('referral_updates', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('patient_referral_id')->constrained()->restrictOnDelete();
            $table->foreignId('recorded_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('recorded_by_name');
            $table->string('status');
            $table->date('scheduled_on')->nullable();
            $table->text('note');
            $table->timestamps();
            $table->index(['organization_id', 'patient_referral_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('referral_updates');
        Schema::table('patient_referrals', function (Blueprint $table) {
            $table->dropColumn(['coordination_status', 'scheduled_on']);
        });
    }
};
