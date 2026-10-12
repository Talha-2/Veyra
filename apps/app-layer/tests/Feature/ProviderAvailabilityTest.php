<?php

namespace Tests\Feature;

use App\Models\ClinicLocation;
use App\Models\ProviderTimeBlock;
use App\Services\Healthcare\AvailabilityService;
use App\Services\Healthcare\BookingService;
use Carbon\CarbonImmutable;
use Tests\SchedulingTestCase;

class ProviderAvailabilityTest extends SchedulingTestCase
{
    private function slots(): array
    {
        return app(AvailabilityService::class)->slots($this->provider, $this->location, $this->service,
            CarbonImmutable::parse('2026-10-12T00:00:00Z'), CarbonImmutable::parse('2026-10-12T23:59:59Z'));
    }

    public function test_slots_are_local_working_hours_converted_to_utc(): void
    {
        $slots = $this->slots();
        $this->assertSame('2026-10-12T04:00:00+00:00', $slots[0]['starts_at']);
        $this->assertSame('2026-10-12T04:30:00+00:00', $slots[0]['ends_at']);
        $this->assertSame('2026-10-12T05:30:00+00:00', end($slots)['starts_at']);
    }

    public function test_booking_and_leave_remove_overlapping_slots_but_allow_adjacency(): void
    {
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        ProviderTimeBlock::create(['provider_id' => $this->provider->id, 'starts_at' => '2026-10-12 05:00:00', 'ends_at' => '2026-10-12 05:30:00']);
        $starts = array_column($this->slots(), 'starts_at');
        $this->assertNotContains('2026-10-12T04:00:00+00:00', $starts);
        $this->assertContains('2026-10-12T04:30:00+00:00', $starts);
        $this->assertNotContains('2026-10-12T05:00:00+00:00', $starts);
        $this->assertContains('2026-10-12T05:30:00+00:00', $starts);
    }

    public function test_cross_location_appointment_blocks_provider_everywhere(): void
    {
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $other = ClinicLocation::create(['name' => 'Other branch', 'timezone' => 'Asia/Karachi']);
        $this->provider->locations()->attach($other);
        $this->location = $other;
        $this->provider->availability()->update(['clinic_location_id' => $other->id]);
        $this->assertNotContains('2026-10-12T04:00:00+00:00', array_column($this->slots(), 'starts_at'));
    }

    public function test_buffers_fit_inside_working_hours_and_block_other_slots(): void
    {
        $this->provider->update(['buffer_before_minutes' => 10, 'buffer_after_minutes' => 10]);
        $starts = array_column($this->slots(), 'starts_at');
        $this->assertSame('2026-10-12T04:10:00+00:00', $starts[0]);
        $this->assertSame('2026-10-12T05:20:00+00:00', end($starts));
    }

    public function test_minimum_notice_and_inactive_provider_are_applied(): void
    {
        $this->provider->update(['minimum_notice_minutes' => 2000]);
        $this->assertSame([], $this->slots());
        $this->provider->update(['minimum_notice_minutes' => 0, 'active' => false]);
        $this->assertSame([], $this->slots());
    }

    public function test_slots_do_not_include_other_patients_identity(): void
    {
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $url = '/desk/providers/'.$this->provider->id.'/slots?location_id='.$this->location->id.'&service_id='.$this->service->id.'&from=2026-10-12&to=2026-10-13';
        $body = $this->getJson($url)->assertOk()->getContent();
        $this->assertStringNotContainsString('Ali Ahmed', $body);
        $this->assertStringNotContainsString('patient_id', $body);
    }

    public function test_block_cannot_overlap_a_booked_appointment(): void
    {
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $this->post('/desk/providers/'.$this->provider->id.'/blocks', ['starts_at' => '2026-10-12T04:00:00Z', 'ends_at' => '2026-10-12T04:15:00Z'])
            ->assertSessionHasErrors('starts_at');
        $this->assertDatabaseCount('provider_time_blocks', 0);
    }

    public function test_reschedule_lookup_can_ignore_only_the_selected_providers_booking(): void
    {
        $a = app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $url = '/desk/providers/'.$this->provider->id.'/slots?location_id='.$this->location->id.'&service_id='.$this->service->id.'&from=2026-10-12&to=2026-10-13&ignore_appointment_id='.$a->id;
        $this->getJson($url)->assertOk()->assertJsonPath('slots.0.starts_at', '2026-10-12T04:00:00+00:00');
    }

    public function test_local_midnight_slots_are_converted_to_the_previous_utc_date(): void
    {
        $this->provider->availability()->update(['start_time' => '00:00', 'end_time' => '02:00']);
        $slots = app(AvailabilityService::class)->slots($this->provider, $this->location, $this->service,
            CarbonImmutable::parse('2026-10-12T00:00:00+05:00'), CarbonImmutable::parse('2026-10-13T00:00:00+05:00'));
        $this->assertSame('2026-10-11T19:00:00+00:00', $slots[0]['starts_at']);
    }
}
