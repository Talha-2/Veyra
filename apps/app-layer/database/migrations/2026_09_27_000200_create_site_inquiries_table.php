<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Demo and contact requests from the company website.
 *
 * Not tenant data: these are people asking Veyra itself for something, before
 * they belong to any organization. The IP is stored hashed — enough to spot
 * one address flooding the form, not enough to identify anyone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_inquiries', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('email', 190);
            $table->string('company', 160)->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('topic', 20);
            $table->text('message')->nullable();
            $table->string('page', 120)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('handled_at')->nullable();
            $table->timestamps();

            $table->index(['created_at']);
            $table->index(['email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_inquiries');
    }
};
