<?php

namespace App\Services\Healthcare;

use App\Models\Appointment;
use App\Models\ClinicalEncounter;
use App\Models\ClinicLocation;
use App\Models\Conversation;
use App\Models\DiagnosticOrder;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\Provider;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClinicWorklist
{
    public function __construct(private ClinicalRecords $records, private ClinicalAncillary $ancillary) {}

    public function props(Request $request): array
    {
        $timezone = Organization::current()->timezone ?: 'Asia/Karachi';
        $asOf = CarbonImmutable::now();
        $today = $asOf->setTimezone($timezone)->format('Y-m-d');
        $stages = ['active', 'all', 'scheduled', 'waiting', 'in_consultation', 'ready_checkout', 'completed', 'cancelled', 'no_show'];
        $data = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'provider_id' => ['nullable', 'integer', Rule::exists('providers', 'id')->where('organization_id', Organization::currentId())],
            'location_id' => ['nullable', 'integer', Rule::exists('clinic_locations', 'id')->where('organization_id', Organization::currentId())],
            'stage' => ['nullable', Rule::in($stages)], 'search' => ['nullable', 'string', 'max:200'],
        ]);
        $filters = ['date' => $data['date'] ?? $today, 'provider_id' => (string) ($data['provider_id'] ?? ''), 'location_id' => (string) ($data['location_id'] ?? ''), 'stage' => $data['stage'] ?? 'active', 'search' => trim($data['search'] ?? '')];
        $day = CarbonImmutable::parse($filters['date'], $timezone)->startOfDay();
        $query = Appointment::query();
        if ($filters['provider_id'] !== '') {
            $query->where('provider_id', $filters['provider_id']);
        }
        if ($filters['location_id'] !== '') {
            $query->where('clinic_location_id', $filters['location_id']);
        }
        if ($filters['search'] !== '') {
            $term = '%'.mb_strtolower($filters['search']).'%';
            $query->whereHas('patient', fn (Builder $patient) => $patient->where(fn (Builder $p) => $p->whereRaw('lower(mrn) like ?', [$term])->orWhereHas('contact', fn (Builder $c) => $c->whereRaw('lower(name) like ?', [$term])->orWhere('phone', 'like', $term))));
        }
        $visuals = $this->visuals(clone $query, $day, $timezone);
        $query->where('starts_at', '>=', $day->utc())->where('starts_at', '<', $day->addDay()->utc());
        $counts = ['total' => (clone $query)->count()];
        foreach (array_slice($stages, 2) as $stage) {
            $counts[$stage] = $this->stage(clone $query, $stage)->count();
        }
        $counts['patients'] = Patient::where('status', 'active')->count();
        $counts['providers'] = Provider::where('active', true)->count();
        $actor = $request->user();
        $clinical = $this->records->canAccess($actor);
        $provider = $clinical ? $this->records->provider($actor) : null;
        $appointments = $this->stage($query, $filters['stage'])->with(['patient.contact', 'provider', 'location', 'service', 'encounter'])->orderBy('starts_at')->orderBy('id')->paginate(25)->withQueryString();
        $appointments->through(function (Appointment $visit) use ($provider, $actor, $asOf) {
            $note = $visit->encounter;
            $readable = $provider && $note && ($note->status === 'signed' || ($note->provider_id === $provider->id && $note->author_user_id === $actor->id));
            $stage = match ($visit->status) {
                'booked' => 'scheduled',
                'checked_in' => ! $visit->consultation_started_at ? 'waiting' : ($note?->status === 'signed' ? 'ready_checkout' : 'in_consultation'),
                default => $visit->status,
            };
            $wait = null;
            if ($visit->checked_in_at && ($visit->consultation_started_at || $stage === 'waiting')) {
                $wait = max(0, (int) floor($visit->checked_in_at->diffInMinutes($visit->consultation_started_at ?? $asOf)));
            }

            return [...AppointmentPresenter::record($visit, true), 'visit_stage' => $stage, 'waiting_minutes' => $wait,
                'can_start' => $provider && $visit->patient->status === 'active' && $visit->provider_id === $provider->id && in_array($visit->status, ['booked', 'checked_in'], true) && (! $note || $readable),
                'encounter' => $readable ? ['id' => $note->id, 'status' => $note->status] : null];
        });
        $attention = null;
        if ($provider) {
            $unsigned = ClinicalEncounter::where('status', 'draft')->where('provider_id', $provider->id)->where('author_user_id', $actor->id);
            $attention = ['unsigned_count' => (clone $unsigned)->count(),
                'unsigned_visits' => (clone $unsigned)->with('patient.contact')->orderBy('occurred_at')->orderBy('id')->limit(25)->get()->map(fn (ClinicalEncounter $note) => ['id' => $note->id, 'patient_id' => $note->patient_id, 'patient_name' => $note->patient->contact?->displayName() ?? 'Unavailable contact', 'mrn' => $note->patient->mrn, 'occurred_at' => $note->occurred_at->toIso8601String()]),
                'pending_results_count' => $this->ancillary->visible(DiagnosticOrder::query(), $actor)->where('status', 'resulted')->whereNotNull('ordered_at')->count()];
        }

        return ['visuals' => $visuals, 'clinic_date' => $filters['date'], 'today_date' => $today, 'timezone' => $timezone, 'as_of' => $asOf->toIso8601String(), 'filters' => $filters,
            'providers' => Provider::orderBy('name')->get(['id', 'name', 'active']), 'locations' => ClinicLocation::orderBy('name')->get(['id', 'name', 'timezone', 'active']),
            'counts' => $counts, 'appointments' => $appointments, 'can_access_clinical' => $clinical, 'messages_waiting' => Conversation::where('status', 'open')->count(), 'attention' => $attention];
    }

    private function stage(Builder $query, string $stage): Builder
    {
        return match ($stage) {
            'all' => $query,
            'active' => $query->whereIn('status', ['booked', 'checked_in']),
            'scheduled' => $query->where('status', 'booked'),
            'waiting' => $query->where('status', 'checked_in')->whereNull('consultation_started_at'),
            'in_consultation' => $query->where('status', 'checked_in')->whereNotNull('consultation_started_at')->whereDoesntHave('encounter', fn (Builder $q) => $q->where('status', 'signed')),
            'ready_checkout' => $query->where('status', 'checked_in')->whereNotNull('consultation_started_at')->whereHas('encounter', fn (Builder $q) => $q->where('status', 'signed')),
            default => $query->where('status', $stage),
        };
    }

    private function visuals(Builder $query, CarbonImmutable $day, string $timezone): array
    {
        $rows = $query->where('starts_at', '>=', $day->subDays(6)->utc())->where('starts_at', '<', $day->addDay()->utc())
            ->get(['provider_id', 'status', 'starts_at', 'checked_in_at', 'consultation_started_at']);
        $empty = ['total' => 0, 'booked' => 0, 'checked_in' => 0, 'completed' => 0, 'cancelled' => 0, 'no_show' => 0];
        $trend = [];
        for ($offset = 6; $offset >= 0; $offset--) {
            $date = $day->subDays($offset)->format('Y-m-d');
            $trend[$date] = ['date' => $date, ...$empty];
        }
        $loads = [];
        $waits = [];
        foreach ($rows as $visit) {
            $date = $visit->starts_at->setTimezone($timezone)->format('Y-m-d');
            $trend[$date]['total']++;
            $trend[$date][$visit->status]++;
            if ($date !== $day->format('Y-m-d')) {
                continue;
            }
            $loads[$visit->provider_id] ??= ['id' => $visit->provider_id, ...$empty];
            $loads[$visit->provider_id]['total']++;
            $loads[$visit->provider_id][$visit->status]++;
            if ($visit->checked_in_at && $visit->consultation_started_at && $visit->consultation_started_at >= $visit->checked_in_at) {
                $waits[] = $visit->checked_in_at->diffInMinutes($visit->consultation_started_at);
            }
        }
        $names = Provider::whereIn('id', array_keys($loads))->pluck('name', 'id');
        $providers = collect($loads)->map(fn ($load) => [...$load, 'name' => $names[$load['id']]])->sortByDesc('total')->values();

        return ['trend' => array_values($trend), 'provider_load' => $providers, 'wait' => ['samples' => count($waits), 'mean_minutes' => $waits ? round(array_sum($waits) / count($waits), 1) : null]];
    }
}
