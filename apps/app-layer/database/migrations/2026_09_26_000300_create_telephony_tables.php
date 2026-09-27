<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Was a single-row global table. Now one row per tenant, because
        // provider credentials are the tenant's, not the deployment's.
        Schema::create('telephony_configs', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('provider')->default('twilio');

            // Provider secrets. Encrypted at rest via the model cast — these are
            // account credentials that can place calls and spend money.
            $table->text('credentials')->nullable();

            // LiveKit SIP trunk + dispatch-rule ids we provisioned, cached so we
            // create them once per tenant rather than per call.
            $table->json('livekit')->nullable();

            $table->timestamps();

            $table->unique('organization_id');
        });

        Schema::create('phone_numbers', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('e164');
            $table->string('friendly_name')->nullable();
            $table->string('country', 2)->default('US');
            $table->string('provider')->default('twilio');
            $table->string('provider_sid')->nullable();
            $table->json('capabilities')->nullable();

            // Who answers. Null user = the AI agent takes it; a user = ring that
            // person, with the agent able to screen and transfer.
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->boolean('sms_autoreply')->default(false);
            $table->json('ivr')->nullable();

            // Per-number language override. See docs/urdu-support.md: a tenant
            // can own an Urdu-facing line and an English one, and the STT model
            // is monolingual for Urdu — so this cannot be a tenant-wide setting.
            // Null means inherit the agent configuration's default.
            $table->string('language')->nullable();

            $table->string('status')->default('active');
            $table->string('monthly_cost')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'e164']);
            $table->index(['organization_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phone_numbers');
        Schema::dropIfExists('telephony_configs');
    }
};
