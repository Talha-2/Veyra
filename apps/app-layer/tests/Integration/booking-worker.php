<?php

use App\Models\Appointment;
use App\Models\Organization;
use App\Models\Provider;
use App\Models\User;
use App\Services\Healthcare\BookingService;
use App\Services\Healthcare\ProviderSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Validation\ValidationException;

// Subprocess for disposable PostgreSQL race tests. Never a production entrypoint.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (getenv('HEALTHCARE_PG_TEST') !== '1' || config('database.default') !== 'pgsql' || config('database.connections.pgsql.database') !== 'healthcare_test') {
    throw new RuntimeException('Race worker requires the disposable healthcare_test PostgreSQL database.');
}
$input = json_decode($argv[1], true, flags: JSON_THROW_ON_ERROR);
Organization::setCurrent(Organization::findOrFail($input['organization_id']));
$actor = User::findOrFail($input['actor_id']);
touch($input['ready']);
$deadline = microtime(true) + 10;
while (! is_file($input['gate'])) {
    if (microtime(true) > $deadline) {
        throw new RuntimeException('Race gate timeout.');
    }
    usleep(10000);
}
try {
    if ($input['mode'] === 'book') {
        app(BookingService::class)->book($input['attributes'], $actor, 'staff');
    } elseif ($input['mode'] === 'block') {
        app(ProviderSchedule::class)->block(Provider::findOrFail($input['provider_id']), $input['attributes'], $actor);
    } else {
        app(BookingService::class)->reschedule(Appointment::findOrFail($input['appointment_id']), CarbonImmutable::parse($input['starts_at']), $actor);
    }
    echo json_encode(['ok' => true]);
} catch (ValidationException) {
    echo json_encode(['ok' => false, 'conflict' => true]);
}
