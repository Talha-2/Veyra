<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patients', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->foreignId('contact_id')->constrained()->restrictOnDelete();
            $table->string('mrn', 32);
            $table->string('status')->default('active');
            $table->date('birth_date')->nullable();
            $table->string('administrative_sex', 24)->nullable();
            foreach (['address_line_1', 'address_line_2', 'city', 'province', 'postal_code', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone'] as $field) {
                $table->string($field)->nullable();
            }
            $table->string('country')->default('Pakistan');
            $table->string('preferred_language', 10)->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'contact_id']);
            $table->unique(['organization_id', 'mrn']);
            $table->index(['organization_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patients');
    }
};
