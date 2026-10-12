<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prescriptions', fn (Blueprint $t) => $t->json('patient_snapshot')->nullable());
        Schema::table('clinic_invoices', fn (Blueprint $t) => $t->json('identity_snapshot')->nullable());
    }

    public function down(): void
    {
        Schema::table('prescriptions', fn (Blueprint $t) => $t->dropColumn('patient_snapshot'));
        Schema::table('clinic_invoices', fn (Blueprint $t) => $t->dropColumn('identity_snapshot'));
    }
};
