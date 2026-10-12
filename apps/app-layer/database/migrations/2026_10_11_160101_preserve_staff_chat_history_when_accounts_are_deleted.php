<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staff_chat_rooms', function (Blueprint $t) {
            $t->dropForeign(['created_by']);
            $t->unsignedBigInteger('created_by')->nullable()->change();
            $t->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
        Schema::table('staff_chat_messages', function (Blueprint $t) {
            $t->dropForeign(['user_id']);
            $t->unsignedBigInteger('user_id')->nullable()->change();
            $t->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
        Schema::table('staff_chat_participants', function (Blueprint $t) {
            $t->dropForeign(['user_id']);
            $t->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        // History can outlive an account; a rollback must preserve those rows.
        Schema::table('staff_chat_rooms', function (Blueprint $t) {
            $t->dropForeign(['created_by']);
            $t->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
        });
        Schema::table('staff_chat_messages', function (Blueprint $t) {
            $t->dropForeign(['user_id']);
            $t->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });
        Schema::table('staff_chat_participants', function (Blueprint $t) {
            $t->dropForeign(['user_id']);
            $t->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });
    }
};
