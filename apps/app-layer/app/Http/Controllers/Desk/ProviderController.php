<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Http\Requests\Desk\StoreProviderRequest;
use App\Http\Requests\Desk\UpdateProviderRequest;
use App\Models\Activity;
use App\Models\ClinicLocation;
use App\Models\HealthcareService;
use App\Models\Organization;
use App\Models\Provider;
use App\Models\User;
use App\Services\Healthcare\ProviderDirectory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class ProviderController extends Controller
{
    public function index()
    {
        return Inertia::render('desk/providers', ['providers' => Provider::with('locations', 'services')->withCount('availability')->orderBy('name')->get(),
            'team' => User::whereHas('memberships', fn ($q) => $q->where('organization_id', Organization::currentId()))->orderBy('name')->get(['id', 'name']),
            'locations' => ClinicLocation::orderBy('name')->get(), 'services' => HealthcareService::orderBy('name')->get(), 'can_manage' => Gate::allows('administer-organization')]);
    }

    public function store(StoreProviderRequest $request, ProviderDirectory $directory)
    {
        $provider = $directory->save(null, $request->validated(), $request->user());

        return redirect()->route('desk.providers.show', $provider)->with('success', 'Provider created.');
    }

    public function show(Provider $provider)
    {
        return Inertia::render('desk/provider', ['provider' => $provider->load('locations', 'services', 'availability', 'blocks'),
            'locations' => ClinicLocation::orderBy('name')->get(), 'services' => HealthcareService::orderBy('name')->get(),
            'team' => User::whereHas('memberships', fn ($q) => $q->where('organization_id', $provider->organization_id))->get(['id', 'name']),
            'can_manage' => Gate::allows('administer-organization')]);
    }

    public function update(UpdateProviderRequest $request, Provider $provider, ProviderDirectory $directory)
    {
        $directory->save($provider, $request->validated(), $request->user());

        return back()->with('success', 'Provider saved.');
    }

    public function location(Request $request)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'address' => ['nullable', 'string', 'max:255'], 'timezone' => ['required', 'timezone']]);
        DB::transaction(function () use ($data, $request) {
            $item = ClinicLocation::create($data);
            Activity::log($item, 'location.created', 'Clinic location created', $request->user());
        });

        return back()->with('success', 'Location created.');
    }

    public function service(Request $request)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'duration_minutes' => ['required', 'integer', 'between:5,480', 'multiple_of:5'], 'fee_minor' => ['nullable', 'integer', 'min:0']]);
        DB::transaction(function () use ($data, $request) {
            $item = HealthcareService::create([...$data, 'currency' => 'PKR']);
            Activity::log($item, 'service.created', 'Healthcare service created', $request->user());
        });

        return back()->with('success', 'Service created.');
    }
}
