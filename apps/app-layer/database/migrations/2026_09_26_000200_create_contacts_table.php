<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Contacts — the foundational model, as in Z360.
 *
 * Every conversation, call, ticket and lead hangs off a contact, and both
 * surfaces read it. A contact is created automatically for any phone number or
 * email address that reaches us, so most rows start with nothing but an
 * identifier and fill in later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->organization();

            $table->string('name')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('company')->nullable();

            $table->string('stage')->default('new');
            $table->string('source')->default('manual');

            // Relationship owner. Nullable because auto-created contacts have
            // nobody assigned yet, and nullOnDelete so removing a user does not
            // take their contacts with them.
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();

            // Whole currency units. Integer, not decimal: this is a sales
            // estimate a human typed, never a computed monetary amount.
            $table->unsignedBigInteger('value')->default(0);

            // No free-text `notes` column, deliberately. Notes are rows on the
            // polymorphic `notes` table — and a column of that name would shadow
            // the `notes()` relation, so `$contact->notes` silently returned the
            // attribute (null) instead of the collection.
            $table->timestamp('last_contact_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            // Phone and email are how inbound activity finds an existing
            // contact, so they are looked up on nearly every inbound message.
            // Unique per tenant, not globally: two organizations can each hold
            // the same customer.
            $table->unique(['organization_id', 'phone']);
            $table->unique(['organization_id', 'email']);
            $table->index(['organization_id', 'stage']);
            $table->index(['organization_id', 'last_contact_at']);
        });

        // Tags were a JSON array on the contact, which cannot answer "show me
        // every contact tagged X" without scanning. A pivot can.
        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->organization();
            $table->string('name');
            $table->string('color')->default('#71717a');
            $table->timestamps();

            $table->unique(['organization_id', 'name']);
        });

        Schema::create('taggables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tag_id')->constrained()->cascadeOnDelete();
            $table->morphs('taggable');
            $table->timestamps();

            $table->unique(['tag_id', 'taggable_id', 'taggable_type'], 'taggables_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('taggables');
        Schema::dropIfExists('tags');
        Schema::dropIfExists('contacts');
    }
};
