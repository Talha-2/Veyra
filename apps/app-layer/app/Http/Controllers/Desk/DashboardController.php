<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Services\Healthcare\ClinicWorklist;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request, ClinicWorklist $worklist): Response
    {
        return Inertia::render('desk/dashboard', $worklist->props($request));
    }
}
