<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Http\ViewModels\Desk\DashboardViewModel;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $days = (int) $request->query('days', 7);
        $days = in_array($days, [7, 14, 30], true) ? $days : 7;

        return Inertia::render('desk/dashboard', (new DashboardViewModel($days, $request->user()))->toArray());
    }
}
