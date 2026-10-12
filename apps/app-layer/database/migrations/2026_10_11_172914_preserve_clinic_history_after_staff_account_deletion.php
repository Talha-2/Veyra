<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['clinic_payments' => 'user_id', 'stock_movements' => 'user_id', 'care_tasks' => 'assigned_user_id'] as $table => $column) {
            Schema::table($table, function (Blueprint $t) use ($column) {
                $t->dropForeign([$column]);
                $t->unsignedBigInteger($column)->nullable()->change();
                $t->foreign($column)->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (['clinic_payments' => 'user_id', 'stock_movements' => 'user_id', 'care_tasks' => 'assigned_user_id'] as $table => $column) {
            Schema::table($table, function (Blueprint $t) use ($column) {
                $t->dropForeign([$column]);
                $t->foreign($column)->references('id')->on('users')->restrictOnDelete();
            });
        }
    }
};
