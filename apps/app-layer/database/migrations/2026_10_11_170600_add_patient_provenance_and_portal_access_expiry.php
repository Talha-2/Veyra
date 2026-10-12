<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('questionnaire_responses', function (Blueprint $table) {
            $table->string('source')->default('clinician');
        });
        Schema::table('patient_portal_accesses', function (Blueprint $table) {
            $table->timestamp('expires_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('patient_portal_accesses', function (Blueprint $table) {
            $table->dropColumn('expires_at');
        });
        Schema::table('questionnaire_responses', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
