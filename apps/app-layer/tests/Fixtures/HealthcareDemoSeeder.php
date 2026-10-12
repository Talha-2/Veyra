<?php

namespace Tests\Fixtures;

use App\Enums\OrganizationRole;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Organization;
use App\Models\User;
use App\Services\Healthcare\BookingService;
use App\Services\Healthcare\PatientRegistry;
use App\Services\Healthcare\ProviderDirectory;
use App\Services\Healthcare\ProviderSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/** Synthetic UI fixtures. Run only in the isolated healthcare preview database. */
class HealthcareDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new \RuntimeException('Preview fixtures cannot run in production.');
        }
        if (Organization::where('slug', 'healthcare-preview')->exists()) {
            return;
        }
        $clinic = Organization::create(['name' => 'Healthcare preview · synthetic data', 'slug' => 'healthcare-preview', 'timezone' => 'Asia/Karachi']);
        $owner = User::create(['name' => 'Demo Administrator', 'email' => 'demo@healthcare.test', 'password' => 'healthcare-demo-only']);
        $clinic->addMember($owner, OrganizationRole::Owner);
        Organization::setCurrent($clinic);
        try {
            $location = ClinicLocation::create(['name' => 'Main clinic', 'timezone' => 'Asia/Karachi', 'address' => 'Lahore · demo location']);
            $service = HealthcareService::create(['name' => 'General consultation', 'duration_minutes' => 30, 'fee_minor' => 250000]);
            $provider = app(ProviderDirectory::class)->save(null, ['name' => 'Dr Ayesha · Demo', 'user_id' => $owner->id, 'specialty' => 'General practice', 'location_ids' => [$location->id], 'service_ids' => [$service->id]], $owner);
            app(ProviderDirectory::class)->save(null, ['name' => 'Dr Omar · Demo', 'specialty' => 'Family medicine', 'location_ids' => [$location->id], 'service_ids' => [$service->id]], $owner);
            app(ProviderSchedule::class)->replace($provider, array_map(fn ($weekday) => ['clinic_location_id' => $location->id, 'weekday' => $weekday, 'start_time' => '09:00', 'end_time' => '17:00'], range(1, 7)), $owner);
            foreach (['Ali Ahmed · Demo', 'Sara Khan · Demo', 'Bilal Hassan · Demo'] as $i => $name) {
                $patient = app(PatientRegistry::class)->register(['name' => $name, 'birth_date' => ['1990-04-03', '1994-08-19', '1985-01-11'][$i], 'city' => 'Lahore'], $owner);
                $start = CarbonImmutable::now('Asia/Karachi')->addDay()->startOfDay()->addHours(10 + $i);
                app(BookingService::class)->book(['patient_id' => $patient->id, 'provider_id' => $provider->id, 'clinic_location_id' => $location->id,
                    'healthcare_service_id' => $service->id, 'starts_at' => $start->toIso8601String(), 'idempotency_key' => 'preview-'.$i], $owner, 'staff');
            }
        } finally {
            Organization::setCurrent(null);
        }
    }
}
