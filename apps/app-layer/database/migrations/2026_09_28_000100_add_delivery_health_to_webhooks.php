<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Real webhook delivery (2026-09-28). An endpoint that keeps failing is turned
 * off automatically and says why; each delivery records how long it took.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('webhook_endpoints', function (Blueprint $table) {
            $table->timestamp('disabled_at')->nullable()->after('enabled');
            $table->string('disabled_reason')->nullable()->after('disabled_at');
            $table->index(['organization_id', 'enabled']);
        });

        Schema::table('webhook_deliveries', function (Blueprint $table) {
            $table->unsignedInteger('duration_ms')->nullable()->after('attempt');
        });
    }

    public function down(): void
    {
        Schema::table('webhook_deliveries', fn (Blueprint $t) => $t->dropColumn('duration_ms'));
        Schema::table('webhook_endpoints', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'enabled']);
            $table->dropColumn(['disabled_at', 'disabled_reason']);
        });
    }
};
