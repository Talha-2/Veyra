<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->timestampTz('checked_in_at')->nullable();
            $table->timestampTz('consultation_started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn(['checked_in_at', 'consultation_started_at', 'completed_at']);
        });
    }
};
