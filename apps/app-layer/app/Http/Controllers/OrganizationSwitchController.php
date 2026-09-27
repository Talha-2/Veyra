<?php

namespace App\Http\Controllers;

use App\Models\Organization;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class OrganizationSwitchController extends Controller
{
    public function __invoke(Request $request, Organization $organization): RedirectResponse
    {
        // Route-model binding resolves any organization by id, so membership is
        // checked here. Without it, switching would be a working cross-tenant
        // read for anyone who could guess an id.
        abort_unless(
            $request->user()->memberships()->where('organization_id', $organization->getKey())->exists(),
            403,
        );

        $organization->switchTo();

        // Back to the root rather than the referring page: surface access is
        // per-organization, so the page they were on may not exist for them in
        // the organization they just moved to.
        return redirect()->route('home');
    }
}
