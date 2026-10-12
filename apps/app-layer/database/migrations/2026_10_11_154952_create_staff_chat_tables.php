<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_chat_rooms', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->string('kind', 16);
            $t->string('name')->nullable();
            $t->string('direct_key')->nullable();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->timestamps();
            $t->unique(['organization_id', 'direct_key']);
        });
        Schema::create('staff_chat_participants', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('staff_chat_room_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('last_read_message_id')->default(0);
            $t->timestamps();
            $t->unique(['staff_chat_room_id', 'user_id']);
        });
        Schema::create('staff_chat_messages', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('staff_chat_room_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->text('body');
            $t->string('client_id', 80);
            $t->timestamps();
            $t->unique(['staff_chat_room_id', 'user_id', 'client_id']);
            $t->index(['staff_chat_room_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_chat_messages');
        Schema::dropIfExists('staff_chat_participants');
        Schema::dropIfExists('staff_chat_rooms');
    }
};
