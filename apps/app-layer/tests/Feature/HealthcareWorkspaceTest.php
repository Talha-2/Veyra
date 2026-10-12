<?php

namespace Tests\Feature;

use App\Enums\IdentifierType;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Services\Healthcare\BookingService;
use App\Services\Healthcare\PatientRegistry;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class HealthcareWorkspaceTest extends SchedulingTestCase
{
    public function test_unnamed_profile_can_be_named_during_patient_registration(): void
    {
        $profile = Contact::create(['phone' => '+923003333333']);
        $this->post('/desk/patients', ['contact_id' => $profile->id, 'name' => 'New patient'])->assertRedirect();
        $this->assertSame('New patient', $profile->fresh()->name);
        $this->assertDatabaseHas('patients', ['contact_id' => $profile->id]);
    }

    public function test_profile_links_resolve_to_patients_or_registration(): void
    {
        $this->get('/desk/patients/profile/'.$this->patient->contact_id)->assertRedirect('/desk/patients/'.$this->patient->id);
        $profile = Contact::create(['name' => 'Waiting for registration']);
        $this->get('/desk/patients/profile/'.$profile->id)->assertRedirect('/desk/patients?profile='.$profile->id);
        $this->get('/desk/patients?profile='.$profile->id)->assertInertia(fn (Assert $page) => $page->where('registration_profile.id', $profile->id));
    }

    public function test_patient_profile_shows_only_their_conversations(): void
    {
        $conversation = Conversation::create(['identifier_id' => Identifier::resolve(IdentifierType::Phone, '+923001111111')->id, 'contact_id' => $this->patient->contact_id, 'channel' => 'sms', 'subject' => 'Visit follow-up']);
        Conversation::create(['identifier_id' => Identifier::resolve(IdentifierType::Phone, '+923002222222')->id, 'channel' => 'sms', 'subject' => 'Unrelated conversation']);
        $this->get('/desk/patients/'.$this->patient->id)->assertInertia(fn (Assert $page) => $page->has('conversations', 1)->where('conversations.0.id', $conversation->id));
    }

    public function test_patient_identity_is_editable_without_a_contacts_page(): void
    {
        $this->patch('/desk/patients/'.$this->patient->id, ['name' => 'Ali Updated', 'phone' => '+923001234567', 'email' => 'ALI@example.test'])->assertRedirect();
        $contact = $this->patient->fresh()->contact;
        $this->assertSame('Ali Updated', $contact->name);
        $this->assertSame('ali@example.test', $contact->email);
        $this->assertSame('+923001234567', $contact->phone);
        $this->assertDatabaseHas('identifiers', ['value' => '+923001234567', 'contact_id' => $contact->id]);
    }

    public function test_duplicate_identity_rejects_the_whole_patient_edit(): void
    {
        app(PatientRegistry::class)->register(['name' => 'Another patient', 'email' => 'taken@example.test'], $this->owner);
        $this->patch('/desk/patients/'.$this->patient->id, ['email' => 'taken@example.test', 'city' => 'Changed'])->assertSessionHasErrors('email');
        $this->assertNull($this->patient->fresh()->city);
    }

    public function test_patient_name_cannot_be_cleared(): void
    {
        $this->patch('/desk/patients/'.$this->patient->id, ['name' => ''])->assertSessionHasErrors('name');
    }

    public function test_dashboard_uses_clinic_day_and_excludes_other_tenants(): void
    {
        $appointment = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $appointment->update(['starts_at' => '2026-10-10T20:00:00Z', 'ends_at' => '2026-10-10T20:30:00Z']);
        $this->get('/desk/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/dashboard')->where('clinic_date', '2026-10-11')->where('counts.patients', 1)->where('counts.total', 1)->has('appointments.data', 1));
        $appointment->forceFill(['organization_id' => $this->otherClinic()->id])->save();
        $this->get('/desk/dashboard')->assertInertia(fn (Assert $page) => $page->where('counts.total', 0)->has('appointments.data', 0));
    }
}
