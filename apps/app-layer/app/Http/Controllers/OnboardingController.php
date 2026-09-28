<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Http\Requests\Onboarding\CreateOrganizationRequest;
use App\Models\Organization;
use App\Services\Organization\StarterAgent;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class OnboardingController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('onboarding/organization', [
            'timezones' => \DateTimeZone::listIdentifiers(),
        ]);
    }

    public function store(CreateOrganizationRequest $request): RedirectResponse
    {
        $organization = DB::transaction(function () use ($request) {
            $organization = Organization::create([
                ...$request->validated(),
                'slug' => $request->slug(),
            ]);

            // The creator is the owner. Done inside the transaction because an
            // organization with no members is unreachable by anyone, including
            // the person who just made it.
            $organization->addMember($request->user(), OrganizationRole::Owner);

            // A working agent from the first minute: front desk + operations,
            // the built-in actions, a ticket type and a pipeline. Without it,
            // a call or a Studio Talk session connected to an agent with no
            // worker behind it.
            $previous = Organization::current();
            Organization::setCurrent($organization);
            try {
                app(StarterAgent::class)->provision($organization);
            } finally {
                Organization::setCurrent($previous);
            }

            return $organization;
        });

        $organization->switchTo();

        return redirect()->route('home');
    }
}
