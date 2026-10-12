<?php

namespace App\Services\Healthcare;

use App\Models\ClinicalEncounter;
use App\Models\DiagnosticOrder;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Models\PatientProblem;
use App\Models\Prescription;
use App\Models\User;

class ClinicalSummary
{
    public function __construct(private ClinicalRecords $records, private ClinicalAncillary $ancillary) {}

    public function forPatient(Patient $patient, User $actor): array
    {
        $provider = $this->records->provider($actor);
        $problems = PatientProblem::where('patient_id', $patient->id)->where('status', 'active')->orderBy('name')->orderBy('id');
        $allergies = PatientAllergy::where('patient_id', $patient->id)->where('status', 'active')->orderBy('allergen')->orderBy('id');
        $signed = ClinicalEncounter::where('patient_id', $patient->id)->where('status', 'signed')->orderByDesc('occurred_at')->orderByDesc('id');
        $review = (clone $signed)->withCount('amendments')->first(['id', 'allergy_status', 'occurred_at']);
        $vitals = null;
        foreach ((clone $signed)->whereNotNull('vitals')->select(['id', 'occurred_at', 'provider_name', 'vitals'])->withCount('amendments')->cursor() as $encounter) {
            $values = array_filter($encounter->vitals ?? [], fn ($value) => $value !== null && $value !== '');
            if ($values !== []) {
                $vitals = ['encounter_id' => $encounter->id, 'recorded_at' => $encounter->occurred_at->toIso8601String(), 'provider_name' => $encounter->provider_name, 'values' => $values, 'amended' => $encounter->amendments_count > 0];
                break;
            }
        }
        $results = $this->ancillary->visible(DiagnosticOrder::where('patient_id', $patient->id), $actor)->where('status', 'resulted')->whereNotNull('ordered_at')->orderBy('resulted_at')->orderBy('id');
        $unsigned = ClinicalEncounter::where('patient_id', $patient->id)->where('status', 'draft')->where('provider_id', $provider->id)->where('author_user_id', $actor->id)->orderBy('occurred_at')->orderBy('id');

        return [
            'problems' => ['total' => (clone $problems)->count(), 'data' => $problems->limit(8)->get(['id', 'name', 'code', 'onset_date'])->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'code' => $p->code, 'onset_date' => $p->onset_date?->format('Y-m-d')])],
            'allergies' => ['total' => (clone $allergies)->count(), 'data' => $allergies->limit(8)->get(['id', 'allergen', 'reaction', 'severity'])],
            'allergy_review' => $review ? ['status' => $review->allergy_status, 'at' => $review->occurred_at->toIso8601String(), 'encounter_id' => $review->id, 'amended' => $review->amendments_count > 0] : null,
            'latest_vitals' => $vitals,
            'recent_prescriptions' => Prescription::where('patient_id', $patient->id)->where('status', 'issued')->whereNotNull('issued_at')->orderByDesc('issued_at')->orderByDesc('id')->limit(3)->get()->map(fn ($rx) => ['id' => $rx->id, 'provider_name' => $rx->provider_name, 'issued_at' => $rx->issued_at->toIso8601String(), 'medicines' => array_values(array_map(fn ($item) => $item['medicine'], $rx->items)), 'item_count' => count($rx->items)]),
            'pending_results' => ['total' => (clone $results)->count(), 'data' => $results->limit(5)->get(['id', 'kind', 'name', 'result_flag', 'resulted_at'])],
            'unsigned_visits' => ['total' => (clone $unsigned)->count(), 'data' => $unsigned->limit(5)->get(['id', 'chief_complaint', 'occurred_at'])],
        ];
    }
}
