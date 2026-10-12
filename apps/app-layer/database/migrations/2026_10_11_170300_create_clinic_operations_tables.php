<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_invoices', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('patient_id')->constrained()->restrictOnDelete();
            $t->string('status')->default('draft');
            $t->string('currency', 3)->default('PKR');
            $t->json('lines');
            $t->bigInteger('total_minor');
            $t->bigInteger('paid_minor')->default(0);
            $t->timestamp('issued_at')->nullable();
            $t->text('void_reason')->nullable();
            $t->timestamps();
        });
        Schema::create('clinic_payments', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('clinic_invoice_id')->constrained()->restrictOnDelete();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->bigInteger('amount_minor');
            $t->string('method');
            $t->string('reference');
            $t->timestamps();
            $t->unique(['organization_id', 'reference']);
        });
        Schema::create('inventory_items', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->string('name');
            $t->string('unit');
            $t->timestamps();
        });
        Schema::create('inventory_batches', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('inventory_item_id')->constrained()->restrictOnDelete();
            $t->string('batch_number');
            $t->date('expires_on');
            $t->integer('quantity')->default(0);
            $t->timestamps();
            $t->unique(['organization_id', 'inventory_item_id', 'batch_number']);
        });
        Schema::create('stock_movements', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('inventory_batch_id')->constrained()->restrictOnDelete();
            $t->foreignId('patient_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->integer('quantity');
            $t->string('kind');
            $t->string('reason');
            $t->string('reference')->nullable();
            $t->timestamps();
            $t->unique(['organization_id', 'reference']);
        });
        Schema::create('care_tasks', function (Blueprint $t) {
            $t->id();
            $t->organization();
            $t->foreignId('patient_id')->constrained()->restrictOnDelete();
            $t->foreignId('assigned_user_id')->constrained('users')->restrictOnDelete();
            $t->string('kind');
            $t->string('title');
            $t->date('due_on');
            $t->string('status')->default('pending');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['care_tasks', 'stock_movements', 'inventory_batches', 'inventory_items', 'clinic_payments', 'clinic_invoices'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
