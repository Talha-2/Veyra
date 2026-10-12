<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Contact;
use App\Models\Organization;
use App\Services\Healthcare\PatientRegistry;
use Illuminate\Validation\ValidationException;
use Tests\HealthcareTestCase;

class PatientRegistryTest extends HealthcareTestCase
{
    public function test_name_only_registration_creates_patient_and_contact(): void
    {
        $patient = app(PatientRegistry::class)->register(['name' => 'Ayesha Khan', 'birth_date' => '2018-04-03'], $this->owner);
        $this->assertSame('Ayesha Khan', $patient->contact->name);
        $this->assertSame($this->clinic->id, $patient->organization_id);
        $this->assertNotEmpty($patient->mrn);
        $this->assertNull($patient->contact->phone);
        $this->assertDatabaseHas('activities', ['type' => 'patient.registered', 'subject_id' => $patient->id, 'user_id' => $this->owner->id]);
    }

    public function test_existing_contact_is_reused_not_duplicated(): void
    {
        $contact = Contact::create(['name' => 'Ali Ahmed']);
        $patient = app(PatientRegistry::class)->register(['contact_id' => $contact->id], $this->owner);
        $this->assertSame($contact->id, $patient->contact_id);
        $this->assertSame(1, Contact::count());
    }

    public function test_cross_tenant_contact_is_rejected(): void
    {
        Organization::setCurrent($this->otherClinic());
        $contact = Contact::create(['name' => 'Other Patient']);
        Organization::setCurrent($this->clinic);
        $this->expectException(ValidationException::class);
        app(PatientRegistry::class)->register(['contact_id' => $contact->id], $this->owner);
    }

    public function test_repeated_registration_is_rejected(): void
    {
        $registry = app(PatientRegistry::class);
        $patient = $registry->register(['name' => 'Ali Ahmed'], $this->owner);
        $this->expectException(ValidationException::class);
        $registry->register(['contact_id' => $patient->contact_id], $this->owner);
    }

    public function test_future_birth_date_is_rejected(): void
    {
        $this->expectException(ValidationException::class);
        app(PatientRegistry::class)->register(['name' => 'Ali', 'birth_date' => '2999-01-01'], $this->owner);
    }

    public function test_mrn_payload_cannot_change_record(): void
    {
        $registry = app(PatientRegistry::class);
        $patient = $registry->register(['name' => 'Ali'], $this->owner);
        $mrn = $patient->mrn;
        $registry->update($patient, ['mrn' => 'FORGED', 'city' => 'Lahore'], $this->owner);
        $this->assertSame($mrn, $patient->fresh()->mrn);
        $this->assertSame('Lahore', $patient->fresh()->city);
    }

    public function test_shared_phone_is_not_silently_merged(): void
    {
        $registry = app(PatientRegistry::class);
        $registry->register(['name' => 'Parent', 'phone' => '+923001234567'], $this->owner);
        $this->expectException(ValidationException::class);
        $registry->register(['name' => 'Child', 'phone' => '+923001234567'], $this->owner);
    }

    public function test_archive_restore_preserves_identity(): void
    {
        $registry = app(PatientRegistry::class);
        $patient = $registry->register(['name' => 'Ali'], $this->owner);
        $registry->archive($patient, $this->owner);
        $this->assertSame('archived', $patient->fresh()->status);
        $registry->restore($patient, $this->owner);
        $this->assertSame('active', $patient->fresh()->status);
        $this->assertNotNull($patient->fresh()->contact);
    }

    public function test_audit_failure_rolls_back_registration(): void
    {
        Activity::creating(fn () => throw new \RuntimeException('audit unavailable'));
        try {
            app(PatientRegistry::class)->register(['name' => 'Ali'], $this->owner);
            $this->fail('Expected audit failure.');
        } catch (\RuntimeException $e) {
            $this->assertSame('audit unavailable', $e->getMessage());
        }
        $this->assertSame(0, Contact::count());
        $this->assertDatabaseCount('patients', 0);
    }
}
