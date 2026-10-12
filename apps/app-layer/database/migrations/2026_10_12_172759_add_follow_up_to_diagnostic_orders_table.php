<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('diagnostic_orders', function (Blueprint $table) {
            $table->string('patient_contact_status')->default('not_recorded');
            $table->foreignId('follow_up_task_id')->nullable()->constrained('care_tasks')->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('diagnostic_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('follow_up_task_id');
            $table->dropColumn('patient_contact_status');
        });
    }
};
