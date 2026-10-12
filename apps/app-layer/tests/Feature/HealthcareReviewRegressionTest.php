<?php

namespace Tests\Feature;

use App\Models\Action;
use App\Models\ClinicLocation;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\HealthcareService;
use App\Models\Identifier;
use App\Models\ToolCall;
use App\Services\Agent\CallContextBuilder;
use App\Services\Healthcare\AvailabilityService;
use App\Services\Healthcare\BookingService;
use App\Services\Healthcare\HealthcareActions;
use App\Services\Healthcare\PatientRegistry;
use App\Services\Healthcare\ProviderSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class HealthcareReviewRegressionTest extends SchedulingTestCase
{
    public function test_empty_country_is_a_field_error_not_a_database_failure(): void
    {
        $this->expectException(ValidationException::class);
        app(PatientRegistry::class)->update($this->patient, ['country' => null], $this->owner);
    }

    public function test_an_unnamed_contact_cannot_be_registered_without_correcting_name(): void
    {
        $contact = Contact::create(['phone' => '+923001111111']);
        $this->expectException(ValidationException::class);
        app(PatientRegistry::class)->register(['contact_id' => $contact->id], $this->owner);
    }

    public function test_existing_booking_notice_does_not_invalidate_unchanged_hours(): void
    {
        $this->provider->update(['minimum_notice_minutes' => 60]);
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-12T03:30:00Z'));
        app(ProviderSchedule::class)->replace($this->provider, [['clinic_location_id' => $this->location->id, 'weekday' => 1, 'start_time' => '09:00', 'end_time' => '11:00']], $this->owner);
        $this->assertDatabaseHas('provider_availabilities', ['provider_id' => $this->provider->id, 'start_time' => '09:00']);
    }

    public function test_partial_range_does_not_offer_a_long_slot_overlapping_a_later_booking(): void
    {
        $this->provider->availability()->update(['end_time' => '17:00']);
        app(BookingService::class)->book($this->booking('2026-10-12T09:00:00Z'), $this->owner, 'staff');
        $long = HealthcareService::create(['name' => 'Long procedure', 'duration_minutes' => 360]);
        $this->provider->services()->attach($long);
        $slots = app(AvailabilityService::class)->slots($this->provider, $this->location, $long,
            CarbonImmutable::parse('2026-10-12T04:30:00Z'), CarbonImmutable::parse('2026-10-12T05:00:00Z'));
        $this->assertSame([], $slots);
    }

    public function test_calendar_converts_another_locations_weekday_and_hours(): void
    {
        $honolulu = ClinicLocation::create(['name' => 'Honolulu', 'timezone' => 'Pacific/Honolulu']);
        $this->provider->locations()->attach($honolulu);
        $this->provider->availability()->create(['clinic_location_id' => $honolulu->id, 'weekday' => 1, 'start_time' => '23:00', 'end_time' => '23:55']);
        $this->get('/desk/calendar?provider_id='.$this->provider->id.'&date=2026-10-12&view=week')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('working_hours', fn ($hours) => collect($hours)->contains(fn ($row) => ($row['date'] ?? null) === '2026-10-13' && ($row['start_time'] ?? null) === '14:00' && ($row['location'] ?? null) === 'Honolulu')));
    }

    public function test_chat_approval_records_trusted_conversation_and_passes_it_separately(): void
    {
        HealthcareActions::sync();
        $action = Action::where('slug', 'book_appointment')->firstOrFail();
        $identifier = Identifier::create(['type' => 'web_session', 'value' => 'approved-chat', 'contact_id' => $this->patient->contact_id]);
        $conversation = Conversation::create(['identifier_id' => $identifier->id, 'contact_id' => $this->patient->contact_id, 'channel' => 'web_chat', 'status' => 'open']);
        $toolCall = ToolCall::create(['action_id' => $action->id, 'action_slug' => 'book_appointment', 'kind' => 'internal', 'status' => 'awaiting_approval',
            'conversation_id' => $conversation->id, 'arguments' => ['conversation_id' => 999, 'confirmed' => true]]);
        config(['services.agent.url' => 'http://gateway.test', 'services.agent.secret' => 'test-only']);
        Http::fake(['*' => Http::response(['ok' => true, 'status' => 'succeeded', 'result' => ['id' => 1]], 200)]);
        $this->post('/studio/approvals/'.$toolCall->id.'/approve')->assertRedirect();
        Http::assertSent(fn ($request) => $request['execution_context']['conversation_id'] === $conversation->id && $request['tool_call_id'] === $toolCall->id);
    }

    public function test_agent_context_carries_global_scheduling_approval_policy(): void
    {
        HealthcareActions::sync();
        Action::where('slug', 'book_appointment')->update(['requires_approval' => true]);
        $context = app(CallContextBuilder::class)->forOrganization($this->clinic);
        $this->assertTrue(collect($context['scheduling_actions'] ?? [])->firstWhere('name', 'book_appointment')['requires_approval'] ?? false);
    }
}
