<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Provider;
use App\Services\Healthcare\BookingService;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\SchedulingTestCase;

class ProviderCalendarTest extends SchedulingTestCase
{
    public function test_provider_directory_exposes_working_hour_count_for_setup_guidance(): void
    {
        $this->get('/desk/providers')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('providers.0.availability_count', 1)->has('team', 1));
    }

    public function test_month_calendar_includes_complete_weeks_and_availability_for_management(): void
    {
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $this->get('/desk/calendar?provider_id='.$this->provider->id.'&date=2026-10-12&view=month')
            ->assertOk()->assertInertia(fn (Assert $page) => $page->has('days', 35)
            ->where('days.0.date', '2026-09-28')->where('days.34.date', '2026-11-01')
            ->where('filters.view', 'month')->has('appointments', 1)->has('provider.availability', 1));
    }

    public function test_agenda_covers_seven_days_starting_on_selected_date(): void
    {
        $this->get('/desk/calendar?provider_id='.$this->provider->id.'&date=2026-10-14&view=agenda')
            ->assertOk()->assertInertia(fn (Assert $page) => $page->has('days', 7)
            ->where('days.0.date', '2026-10-14')->where('days.6.date', '2026-10-20'));
    }

    public function test_provider_calendar_shows_appointments_in_selected_week(): void
    {
        app(BookingService::class)->book($this->booking(), $this->owner, 'staff');
        $this->get('/desk/calendar?provider_id='.$this->provider->id.'&date=2026-10-12&view=week')
            ->assertOk()->assertInertia(fn (Assert $page) => $page->component('desk/calendar')->has('appointments', 1)->has('days', 7)->where('timezone', 'Asia/Karachi'));
    }

    public function test_calendar_cannot_read_another_clinics_provider(): void
    {
        Organization::setCurrent($this->otherClinic());
        $other = Provider::create(['name' => 'Other Doctor']);
        Organization::setCurrent($this->clinic);
        $this->get('/desk/calendar?provider_id='.$other->id)->assertNotFound();
    }

    public function test_patient_options_only_show_active_patients(): void
    {
        $this->getJson('/desk/calendar/patients?search=Ali')->assertOk()->assertJsonCount(1, 'data');
        $this->patient->update(['status' => 'archived']);
        $this->getJson('/desk/calendar/patients?search=Ali')->assertOk()->assertJsonCount(0, 'data');
    }
}
