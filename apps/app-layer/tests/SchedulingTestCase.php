<?php

namespace Tests;

use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Patient;
use App\Models\Provider;
use App\Models\ProviderAvailability;
use App\Services\Healthcare\PatientRegistry;
use Carbon\CarbonImmutable;

abstract class SchedulingTestCase extends HealthcareTestCase
{
    protected Provider $provider;

    protected ClinicLocation $location;

    protected HealthcareService $service;

    protected Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-11T03:00:00Z'));
        $this->provider = Provider::create(['name' => 'Dr Ayesha', 'specialty' => 'General practice']);
        $this->location = ClinicLocation::create(['name' => 'Lahore', 'timezone' => 'Asia/Karachi']);
        $this->service = HealthcareService::create(['name' => 'Consultation', 'duration_minutes' => 30]);
        $this->provider->locations()->attach($this->location);
        $this->provider->services()->attach($this->service);
        ProviderAvailability::create(['provider_id' => $this->provider->id, 'clinic_location_id' => $this->location->id, 'weekday' => 1, 'start_time' => '09:00', 'end_time' => '11:00']);
        $this->patient = app(PatientRegistry::class)->register(['name' => 'Ali Ahmed'], $this->owner);
    }

    protected function booking(string $start = '2026-10-12T04:00:00Z', string $key = 'booking-one'): array
    {
        return ['patient_id' => $this->patient->id, 'provider_id' => $this->provider->id, 'clinic_location_id' => $this->location->id,
            'healthcare_service_id' => $this->service->id, 'starts_at' => $start, 'idempotency_key' => $key];
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }
}
