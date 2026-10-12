<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Conversation;
use App\Models\Identifier;
use App\Models\Organization;
use App\Services\Healthcare\BookingService;
use App\Services\Healthcare\PatientRegistry;
use Tests\SchedulingTestCase;

class AgentSchedulingTest extends SchedulingTestCase
{
    private function base(): string
    {
        return '/api/agent/v1/organizations/'.$this->clinic->id.'/scheduling';
    }

    private function conversation(?int $contactId): Conversation
    {
        Organization::setCurrent($this->clinic);
        $identifier = Identifier::create(['type' => 'web_session', 'value' => 'visitor-'.uniqid(), 'contact_id' => $contactId]);

        return Conversation::create(['identifier_id' => $identifier->id, 'contact_id' => $contactId, 'channel' => 'web_chat', 'status' => 'open']);
    }

    private function agent(?int $conversationId = null): static
    {
        config(['services.agent.secret' => 'test-agent-secret']);
        $this->flushHeaders()->withToken('test-agent-secret');
        if ($conversationId) {
            $this->withHeader('X-Veyra-Conversation', (string) $conversationId);
        }

        return $this;
    }

    public function test_customer_booking_uses_linked_patient_and_replays_one_record(): void
    {
        $conversation = $this->conversation($this->patient->contact_id);
        $data = [...$this->booking(), 'confirmed' => true];
        unset($data['patient_id']);
        $this->agent($conversation->id)->postJson($this->base().'/appointments', $data)->assertCreated()->assertJsonPath('appointment.status', 'booked');
        $this->agent($conversation->id)->postJson($this->base().'/appointments', $data)->assertSuccessful();
        $this->assertSame(1, Appointment::withoutGlobalScopes()->count());
    }

    public function test_anonymous_customer_and_unconfirmed_booking_are_refused(): void
    {
        $conversation = $this->conversation(null);
        $this->agent($conversation->id)->postJson($this->base().'/appointments', [...$this->booking(), 'confirmed' => true])->assertForbidden();
        Organization::setCurrent($this->clinic);
        $conversation->update(['contact_id' => $this->patient->contact_id]);
        $this->agent($conversation->id)->postJson($this->base().'/appointments', $this->booking())->assertUnprocessable();
        $this->assertSame(0, Appointment::withoutGlobalScopes()->count());
    }

    public function test_customer_cannot_book_or_cancel_for_another_patient(): void
    {
        $other = app(PatientRegistry::class)->register(['name' => 'Other Person'], $this->owner);
        $conversation = $this->conversation($this->patient->contact_id);
        $this->agent($conversation->id)->postJson($this->base().'/appointments', [...$this->booking(), 'patient_id' => $other->id, 'confirmed' => true])->assertForbidden();
        Organization::setCurrent($this->clinic);
        $a = app(BookingService::class)->book([...$this->booking(), 'patient_id' => $other->id], $this->owner, 'staff');
        $this->agent($conversation->id)->postJson($this->base().'/appointments/'.$a->id.'/cancel', ['confirmed' => true])->assertNotFound();
    }

    public function test_customer_slots_and_list_hide_other_patients(): void
    {
        $a = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $conversation = $this->conversation(null);
        $response = $this->agent($conversation->id)->getJson($this->base().'/slots?provider_id='.$this->provider->id.'&location_id='.$this->location->id.'&service_id='.$this->service->id.'&from=2026-10-12&to=2026-10-13')->assertOk();
        $this->assertStringNotContainsString('Ali Ahmed', $response->getContent());
        $this->agent($conversation->id)->getJson($this->base().'/appointments')->assertOk()->assertJsonCount(0, 'appointments');
    }

    public function test_provider_catalog_omits_credentials_and_other_tenants(): void
    {
        $this->provider->update(['registration_number' => 'PRIVATE-REG']);
        $body = $this->agent()->getJson($this->base().'/providers')->assertOk()->getContent();
        $this->assertStringNotContainsString('PRIVATE-REG', $body);
        $this->assertStringContainsString('Consultation', $body);
    }

    public function test_customer_can_ignore_their_booking_for_reschedule_but_not_anothers(): void
    {
        $a = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $conversation = $this->conversation($this->patient->contact_id);
        $url = $this->base().'/slots?provider_id='.$this->provider->id.'&location_id='.$this->location->id.'&service_id='.$this->service->id.'&from=2026-10-12&to=2026-10-13&ignore_appointment_id='.$a->id;
        $this->agent($conversation->id)->getJson($url)->assertOk()->assertJsonPath('slots.0.starts_at', '2026-10-12T04:00:00+00:00');
        $anonymous = $this->conversation(null);
        $this->agent($anonymous->id)->getJson($url)->assertNotFound();
    }
}
