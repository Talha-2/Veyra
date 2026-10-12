<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\CareTask;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\Provider;
use App\Services\Healthcare\ClinicalRecords;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class HealthcareModulesController extends Controller
{
    public function index(Request $request, ClinicalRecords $clinical): Response
    {
        $organization = Organization::current();
        $timezone = $organization->timezone ?: 'Asia/Karachi';
        $day = CarbonImmutable::now($timezone)->startOfDay();
        $date = $day->format('Y-m-d');

        return Inertia::render('desk/healthcare-modules', ['can_access_clinical' => $clinical->canAccess($request->user()), 'organization' => ['name' => $organization->name], 'clinic_date' => $date, 'timezone' => $timezone,
            'counts' => ['patients' => Patient::where('status', 'active')->count(), 'providers' => Provider::where('active', true)->count(), 'appointments_today' => Appointment::where('starts_at', '>=', $day->utc())->where('starts_at', '<', $day->addDay()->utc())->count(),
                'open_tasks' => CareTask::where('status', 'pending')->count(), 'overdue_tasks' => CareTask::where('status', 'pending')->where('due_on', '<', $date)->count()]]);
    }
}
