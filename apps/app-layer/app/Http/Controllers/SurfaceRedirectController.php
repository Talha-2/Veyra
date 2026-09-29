<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;

/**
 * The root route.
 *
 * Because Desk and Studio are separate products with separate access, there is
 * no single home page to render — where you belong depends on what you were
 * granted. Anyone with Studio (owners, admins) lands there; an operator with
 * only Desk lands in Desk.
 */
class SurfaceRedirectController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        $surface = $request->user()->landingSurface();

        if (! $surface) {
            abort(403, 'Your account has no product access in this organization. Ask an owner or admin to grant it.');
        }

        return redirect($surface->home());
    }
}
