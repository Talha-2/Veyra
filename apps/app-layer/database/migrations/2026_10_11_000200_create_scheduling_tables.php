<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('providers', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->string('name');
            $t->string('specialty')->nullable();
            $t->string('registration_number')->nullable();
            $t->string('qualifications')->nullable();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->boolean('active')->default(true);
            $t->unsignedInteger('buffer_before_minutes')->default(0);
            $t->unsignedInteger('buffer_after_minutes')->default(0);
            $t->unsignedInteger('minimum_notice_minutes')->default(0);
            $t->unsignedInteger('booking_horizon_days')->default(90);
            $t->timestamps();
        });
        Schema::create('clinic_locations', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->string('name');
            $t->string('address')->nullable();
            $t->string('timezone')->default('Asia/Karachi');
            $t->timestamps();
        });
        Schema::create('healthcare_services', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->string('name');
            $t->unsignedInteger('duration_minutes');
            $t->unsignedBigInteger('fee_minor')->nullable();
            $t->string('currency', 3)->default('PKR');
            $t->timestamps();
        });
        foreach (['clinic_location_provider' => 'clinic_location_id', 'healthcare_service_provider' => 'healthcare_service_id'] as $table => $related) {
            Schema::create($table, function (Blueprint $t) use ($related) {
                $t->foreignId('provider_id')->constrained()->cascadeOnDelete();
                $t->foreignId($related)->constrained()->cascadeOnDelete();
                $t->primary(['provider_id', $related]);
            });
        }
        Schema::create('provider_availabilities', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('provider_id')->constrained()->cascadeOnDelete();
            $t->foreignId('clinic_location_id')->constrained()->restrictOnDelete();
            $t->unsignedSmallInteger('weekday');
            $t->string('start_time', 5);
            $t->string('end_time', 5);
            $t->timestamps();
            $t->index(['provider_id', 'weekday']);
        });
        Schema::create('provider_time_blocks', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('provider_id')->constrained()->cascadeOnDelete();
            $t->dateTime('starts_at');
            $t->dateTime('ends_at');
            $t->string('label')->nullable();
            $t->timestamps();
            $t->index(['provider_id', 'starts_at']);
        });
        Schema::create('appointments', function (Blueprint $t) {
            $t->id();
            $t->organization();
            foreach (['patient_id', 'provider_id', 'clinic_location_id', 'healthcare_service_id'] as $foreign) {
                $t->foreignId($foreign)->constrained()->restrictOnDelete();
            }
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('conversation_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status')->default('booked');
            $t->string('source')->default('staff');
            $t->dateTime('starts_at');
            $t->dateTime('ends_at');
            $t->string('timezone');
            $t->unsignedInteger('duration_minutes');
            $t->unsignedInteger('buffer_before_minutes')->default(0);
            $t->unsignedInteger('buffer_after_minutes')->default(0);
            $t->string('idempotency_key', 180);
            $t->string('request_fingerprint', 64);
            $t->timestamps();
            $t->unique(['organization_id', 'idempotency_key']);
            $t->index(['provider_id', 'starts_at']);
        });
    }

    public function down(): void
    {
        foreach (['appointments', 'provider_time_blocks', 'provider_availabilities', 'healthcare_service_provider', 'clinic_location_provider', 'healthcare_services', 'clinic_locations', 'providers'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
