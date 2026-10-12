<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Patient;
use App\Models\Provider;
use App\Services\Healthcare\AppointmentPresenter;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class CalendarController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['provider_id' => ['nullable', 'integer'], 'date' => ['nullable', 'date_format:Y-m-d'], 'view' => ['nullable', 'in:day,week,month,agenda']]);
        $providers = Provider::with('locations', 'services')->orderBy('name')->get();
        $provider = $request->filled('provider_id') ? Provider::with('locations', 'services')->findOrFail($request->integer('provider_id')) : $providers->first();
        $provider?->load('availability', 'blocks');
        $zone = $provider?->locations->first()?->timezone ?? 'Asia/Karachi';
        $date = $request->query('date', CarbonImmutable::now($zone)->format('Y-m-d'));
        $view = $request->query('view', 'week');
        $from = CarbonImmutable::parse($date, $zone)->startOfDay();
        if ($view === 'week') {
            $from = $from->startOfWeek();
        }
        $to = $from->addDays(in_array($view, ['week', 'agenda']) ? 7 : 1);
        if ($view === 'month') {
            $from = $from->startOfMonth()->startOfWeek();
            $to = CarbonImmutable::parse($date, $zone)->endOfMonth()->endOfWeek()->addDay()->startOfDay();
        }
        $days = [];
        for ($day = $from; $day < $to; $day = $day->addDay()) {
            $days[] = ['date' => $day->format('Y-m-d'), 'label' => $day->format('D j M'), 'weekday' => $day->isoWeekday()];
        }
        $appointments = $provider?->appointments()->where('starts_at', '<', $to->utc())->where('ends_at', '>', $from->utc())
            ->with('patient.contact', 'provider', 'location', 'service')->orderBy('starts_at')->get()->map(fn ($a) => AppointmentPresenter::record($a, true)) ?? [];
        $blocks = $provider?->blocks()->where('starts_at', '<', $to->utc())->where('ends_at', '>', $from->utc())->get() ?? [];
        if ($provider) {
            Activity::log($provider, 'provider.calendar_viewed', 'Provider calendar accessed', $request->user());
        }

        return Inertia::render('desk/calendar', ['providers' => $providers, 'provider' => $provider, 'appointments' => $appointments, 'blocks' => $blocks,
            'working_hours' => $provider ? $this->workingHours($provider, $from, $to, $zone) : [], 'days' => $days, 'timezone' => $zone,
            'filters' => ['date' => $date, 'view' => $view], 'can_manage' => Gate::allows('administer-organization')]);
    }

    public function patients(Request $request)
    {
        $search = mb_strtolower(trim((string) $request->query('search')));

        return Patient::with('contact')->where('status', 'active')->whereHas('contact')
            ->when($search, fn ($q) => $q->where(fn ($p) => $p->whereRaw('lower(mrn) like ?', ['%'.$search.'%'])->orWhereHas('contact', fn ($c) => $c->whereRaw('lower(name) like ?', ['%'.$search.'%']))))
            ->orderBy('id')->paginate(20)->withQueryString()->through(fn ($p) => ['id' => $p->id, 'name' => $p->contact->displayName(), 'mrn' => $p->mrn]);
    }

    private function workingHours(Provider $provider, CarbonImmutable $from, CarbonImmutable $to, string $displayZone): array
    {
        $locations = $provider->locations->keyBy('id');
        $windows = [];
        foreach ($provider->availability()->get() as $rule) {
            $location = $locations->get($rule->clinic_location_id);
            if (! $location) {
                continue;
            }
            $first = $from->setTimezone($location->timezone)->startOfDay()->subDay();
            $last = $to->setTimezone($location->timezone)->startOfDay()->addDay();
            for ($date = $first; $date <= $last; $date = $date->addDay()) {
                if ($date->isoWeekday() !== (int) $rule->weekday) {
                    continue;
                }
                $start = CarbonImmutable::parse($date->format('Y-m-d').' '.$rule->start_time, $location->timezone)->setTimezone($displayZone);
                $end = CarbonImmutable::parse($date->format('Y-m-d').' '.$rule->end_time, $location->timezone)->setTimezone($displayZone);
                for ($day = $from; $day < $to; $day = $day->addDay()) {
                    $next = $day->addDay();
                    if ($start >= $next || $end <= $day) {
                        continue;
                    }
                    $segmentStart = $start > $day ? $start : $day;
                    $segmentEnd = $end < $next ? $end : $next;
                    $windows[] = ['date' => $day->format('Y-m-d'), 'start_time' => $segmentStart->format('H:i'),
                        'end_time' => $segmentEnd->equalTo($next) ? '24:00' : $segmentEnd->format('H:i'), 'location' => $location->name];
                }
            }
        }

        return $windows;
    }
}
