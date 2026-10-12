<?php

namespace Tests\Integration;

use App\Enums\OrganizationRole;
use App\Models\Appointment;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Organization;
use App\Models\Provider;
use App\Models\ProviderTimeBlock;
use App\Models\User;
use App\Services\Healthcare\BookingService;
use App\Services\Healthcare\PatientRegistry;
use Carbon\CarbonImmutable;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class AppointmentConcurrencyTest extends TestCase
{
    private array $booking;

    private Organization $clinic;

    private User $owner;

    protected function setUp(): void
    {
        if (getenv('HEALTHCARE_PG_TEST') !== '1') {
            throw new \RuntimeException('Use phpunit-scheduling-pg.xml and the disposable PostgreSQL container.');
        }
        parent::setUp();
        if (config('database.default') !== 'pgsql' || config('database.connections.pgsql.database') !== 'healthcare_test') {
            throw new \RuntimeException('Refusing to migrate a non-test database.');
        }
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        $this->clinic = Organization::create(['name' => 'Race fixtures', 'slug' => 'race']);
        $this->owner = User::create(['name' => 'Tester', 'email' => 'race@example.test', 'password' => 'test-only']);
        $this->clinic->addMember($this->owner, OrganizationRole::Owner);
        Organization::setCurrent($this->clinic);
        $provider = Provider::create(['name' => 'Race Doctor']);
        $location = ClinicLocation::create(['name' => 'Test location']);
        $service = HealthcareService::create(['name' => 'Test service', 'duration_minutes' => 30]);
        $provider->locations()->attach($location);
        $provider->services()->attach($service);
        $start = CarbonImmutable::now('Asia/Karachi')->addDay()->startOfDay()->addHours(10);
        $provider->availability()->create(['clinic_location_id' => $location->id, 'weekday' => $start->isoWeekday(), 'start_time' => '09:00', 'end_time' => '17:00']);
        $patient = app(PatientRegistry::class)->register(['name' => 'Synthetic patient'], $this->owner);
        $this->booking = ['patient_id' => $patient->id, 'provider_id' => $provider->id, 'clinic_location_id' => $location->id, 'healthcare_service_id' => $service->id,
            'starts_at' => $start->toIso8601String(), 'idempotency_key' => 'one'];
    }

    public function test_two_processes_cannot_book_overlapping_slots(): void
    {
        $results = $this->race(['mode' => 'book', 'attributes' => $this->booking], ['mode' => 'book', 'attributes' => [...$this->booking, 'idempotency_key' => 'two']]);
        $this->assertSame(1, count(array_filter($results, fn ($r) => $r['ok'])));
        $this->assertSame(1, Appointment::count());
    }

    public function test_block_and_booking_use_the_same_provider_lock(): void
    {
        $start = CarbonImmutable::parse($this->booking['starts_at']);
        $results = $this->race(['mode' => 'book', 'attributes' => $this->booking],
            ['mode' => 'block', 'provider_id' => $this->booking['provider_id'], 'attributes' => ['starts_at' => $start->toIso8601String(), 'ends_at' => $start->addMinutes(30)->toIso8601String()]]);
        $this->assertSame(1, count(array_filter($results, fn ($r) => $r['ok'])));
        $this->assertSame(1, Appointment::count() + ProviderTimeBlock::count());
    }

    public function test_reschedule_and_booking_cannot_take_the_same_slot(): void
    {
        $a = app(BookingService::class)->book($this->booking, $this->owner, 'staff');
        $new = CarbonImmutable::parse($this->booking['starts_at'])->addHour()->toIso8601String();
        $results = $this->race(['mode' => 'reschedule', 'appointment_id' => $a->id, 'starts_at' => $new],
            ['mode' => 'book', 'attributes' => [...$this->booking, 'starts_at' => $new, 'idempotency_key' => 'two']]);
        $this->assertSame(1, count(array_filter($results, fn ($r) => $r['ok'])));
        $this->assertSame(1, Appointment::where('starts_at', CarbonImmutable::parse($new)->utc())->count());
    }

    private function race(array $left, array $right): array
    {
        $gate = sys_get_temp_dir().'/healthcare-race-'.bin2hex(random_bytes(8));
        $processes = [];
        $files = [$gate];
        try {
            foreach ([$left, $right] as $index => $input) {
                $ready = $gate.'-'.$index;
                $files[] = $ready;
                $payload = [...$input, 'organization_id' => $this->clinic->id, 'actor_id' => $this->owner->id, 'gate' => $gate, 'ready' => $ready];
                $process = new Process([PHP_BINARY, base_path('tests/Integration/booking-worker.php'), json_encode($payload)], base_path(), [
                    'HEALTHCARE_PG_TEST' => '1', 'APP_ENV' => 'testing', 'DB_CONNECTION' => 'pgsql',
                    'DB_HOST' => 'host.docker.internal', 'DB_PORT' => '5444', 'DB_DATABASE' => 'healthcare_test',
                    'DB_USERNAME' => 'healthcare_test', 'DB_PASSWORD' => 'healthcare_test_only', 'DB_URL' => '',
                    'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'CACHE_STORE' => 'array',
                ]);
                $process->setTimeout(20);
                $process->start();
                $processes[] = $process;
            }
            $deadline = microtime(true) + 10;
            while (! is_file($files[1]) || ! is_file($files[2])) {
                if (microtime(true) > $deadline) {
                    $this->fail('Race workers did not reach the gate: '.implode(' ', array_map(fn ($p) => $p->getErrorOutput(), $processes)));
                }
                usleep(10000);
            }
            touch($gate);
            $results = [];
            foreach ($processes as $process) {
                $process->wait();
                $this->assertSame(0, $process->getExitCode(), $process->getErrorOutput());
                $results[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            }

            return $results;
        } finally {
            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop();
                }
            }
            foreach ($files as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
        }
    }
}
