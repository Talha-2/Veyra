<?php

namespace App\Services\Healthcare;

use App\Models\Activity;
use App\Models\ClinicalEncounter;
use App\Models\MedicationAdministration;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Models\PatientProblem;
use App\Models\Prescription;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class ClinicalCare
{
    public function __construct(private ClinicalRecords $records) {}

    public function patient(Patient $patient, User $user): void
    {
        $this->records->provider($user);
        abort_unless($patient->organization_id === Organization::currentId(), 404);
    }

    private function active(Patient $patient): Patient
    {
        $patient = Patient::lockForUpdate()->findOrFail($patient->id);
        if ($patient->status !== 'active') {
            throw ValidationException::withMessages(['patient' => 'Restore this patient before recording new care.']);
        }

        return $patient;
    }

    public function add(Patient $patient, User $user, string $kind, array $attributes): Model
    {
        $this->patient($patient, $user);
        $rules = $kind === 'problem' ? ['name' => ['required', 'string', 'max:255'], 'code' => ['nullable', 'string', 'max:80'], 'onset_date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'], 'notes' => ['nullable', 'string', 'max:5000']] : ['allergen' => ['required', 'string', 'max:255'], 'reaction' => ['required', 'string', 'max:255'], 'severity' => ['required', 'in:mild,moderate,severe,unknown'], 'notes' => ['nullable', 'string', 'max:5000']];
        $data = Validator::make($attributes, $rules)->validate();

        return DB::transaction(function () use ($patient, $user, $kind, $data) {
            $this->active($patient);
            $class = $kind === 'problem' ? PatientProblem::class : PatientAllergy::class;
            $record = $class::create([...$data, 'patient_id' => $patient->id, 'recorded_by' => $user->id]);
            Activity::log($patient, 'patient.'.$kind.'_recorded', 'Clinical history updated', $user, ['record_id' => $record->id]);

            return $record;
        });
    }

    private function version(Model $record, array $data): void
    {
        if ((int) $record->version !== (int) $data['version']) {
            throw ValidationException::withMessages(['version' => 'This record changed. Reload it before continuing.']);
        }
    }

    public function close(Model $record, User $user, array $attributes): void
    {
        $patient = Patient::findOrFail($record->patient_id);
        $this->patient($patient, $user);
        $reasonRequired = $record instanceof PatientAllergy || $record instanceof MedicationAdministration;
        $data = Validator::make($attributes, ['version' => ['required', 'integer', 'min:1'], 'reason' => [$reasonRequired ? 'required' : 'nullable', 'string', 'max:2000']])->validate();
        DB::transaction(function () use ($record, $patient, $user, $data) {
            $this->active($patient);
            $locked = $record::whereKey($record->id)->lockForUpdate()->firstOrFail();
            $this->version($locked, $data);
            if (! in_array($locked->status, ['active', 'recorded'], true)) {
                throw ValidationException::withMessages(['record' => 'This entry is already closed. Its original closure remains in history.']);
            }
            if ($locked instanceof MedicationAdministration) {
                abort_unless($locked->author_user_id === $user->id, 403);
                $locked->fill(['status' => 'voided', 'void_reason' => $data['reason'], 'voided_at' => now()]);
            } elseif ($locked instanceof PatientAllergy) {
                $locked->fill(['status' => 'inactive', 'inactive_reason' => $data['reason'], 'inactive_at' => now()]);
            } else {
                $locked->fill(['status' => 'resolved', 'resolved_at' => now()]);
            }
            $locked->version++;
            $locked->save();
            Activity::log($patient, 'clinical.record_closed', 'Clinical history updated', $user, ['record_type' => class_basename($record), 'record_id' => $record->id]);
        });
    }

    public static function prescriptionRules(): array
    {
        return ['encounter_id' => ['nullable', 'integer'], 'items' => ['required', 'array', 'list', 'min:1', 'max:20'], 'items.*' => ['array:medicine,strength,dose,route,frequency,duration_days,quantity,instructions'], 'items.*.medicine' => ['required', 'string', 'max:255'], 'items.*.strength' => ['nullable', 'string', 'max:120'], 'items.*.dose' => ['required', 'string', 'max:120'], 'items.*.route' => ['required', 'string', 'max:120'], 'items.*.frequency' => ['required', 'string', 'max:120'], 'items.*.duration_days' => ['required', 'integer', 'between:1,365'], 'items.*.quantity' => ['required', 'integer', 'between:1,10000'], 'items.*.instructions' => ['nullable', 'string', 'max:2000']];
    }

    public function draft(Patient $patient, User $user, array $attributes): Prescription
    {
        $this->patient($patient, $user);
        $provider = $this->records->provider($user);
        $data = Validator::make($attributes, self::prescriptionRules())->validate();

        return DB::transaction(function () use ($patient, $user, $provider, $data) {
            $this->active($patient);
            if (! empty($data['encounter_id'])) {
                $encounter = ClinicalEncounter::find($data['encounter_id']);
                if (! $encounter || $encounter->patient_id !== $patient->id) {
                    throw ValidationException::withMessages(['encounter_id' => 'Choose a visit from this patient’s chart.']);
                }
                $this->records->assertRead($encounter, $user);
            }
            $rx = Prescription::create(['patient_id' => $patient->id, 'provider_id' => $provider->id, 'author_user_id' => $user->id, 'provider_name' => $provider->name, 'registration_number' => $provider->registration_number, 'encounter_id' => $data['encounter_id'] ?? null, 'items' => $data['items']]);
            Activity::log($rx, 'prescription.drafted', 'Prescription drafted', $user);

            return $rx;
        });
    }

    public function assertRead(Prescription $rx, User $user): void
    {
        $provider = $this->records->provider($user);
        abort_unless($rx->organization_id === Organization::currentId(), 404);
        abort_unless($rx->issued_at !== null || ($rx->author_user_id === $user->id && $rx->provider_id === $provider->id), 403);
    }

    public function change(Prescription $rx, User $user, array $attributes, string $action): void
    {
        $this->assertRead($rx, $user);
        $provider = $this->records->provider($user);
        abort_unless($rx->author_user_id === $user->id && $rx->provider_id === $provider->id, 403);
        DB::transaction(function () use ($rx, $user, $attributes, $action) {
            $this->active($rx->patient);
            $rx = Prescription::whereKey($rx->id)->lockForUpdate()->firstOrFail();
            if (($action === 'edit' || $action === 'issue') && $rx->status !== 'draft') {
                throw ValidationException::withMessages(['prescription' => 'Issued prescriptions cannot be edited. Create a new prescription.']);
            }
            $rules = ['version' => ['required', 'integer', 'min:1']];
            if ($action === 'edit') {
                $rules = [...$rules, ...self::prescriptionRules()];
            }
            if ($action === 'issue') {
                $rules['reviewed'] = ['required', 'accepted'];
            }
            if ($action === 'cancel') {
                $rules['reason'] = ['required', 'string', 'max:2000'];
            }
            $data = Validator::make($attributes, $rules)->validate();
            $this->version($rx, $data);
            if ($action === 'edit') {
                $rx->items = $data['items'];
            } elseif ($action === 'issue') {
                $rx->status = 'issued';
                $rx->issued_at = now();
                $patient = Patient::with('contact')->findOrFail($rx->patient_id);
                $rx->patient_snapshot = ['name' => $patient->contact->displayName(), 'mrn' => $patient->mrn,
                    'clinic_name' => Organization::current()->name, 'clinic_timezone' => Organization::current()->timezone];
                $rx->allergy_review = PatientAllergy::where('patient_id', $rx->patient_id)->where('status', 'active')->get(['id', 'allergen', 'reaction', 'severity'])->toArray();
            } else {
                if ($rx->status === 'cancelled') {
                    throw ValidationException::withMessages(['prescription' => 'This prescription is already cancelled.']);
                } $rx->status = 'cancelled';
                $rx->cancelled_at = now();
                $rx->cancel_reason = $data['reason'];
            }
            $rx->version++;
            $rx->save();
            Activity::log($rx, 'prescription.'.$action, 'Prescription status updated', $user, ['status' => $rx->status]);
        });
    }

    public function administer(Patient $patient, User $user, array $attributes): MedicationAdministration
    {
        $this->patient($patient, $user);
        $provider = $this->records->provider($user);
        $data = Validator::make($attributes, ['kind' => ['required', 'in:injection,vaccine'], 'name' => ['required', 'string', 'max:255'], 'dose' => ['required', 'string', 'max:120'], 'route' => ['required', 'string', 'max:120'], 'site' => ['nullable', 'string', 'max:120'], 'lot_number' => ['nullable', 'string', 'max:120'], 'expiry_date' => ['nullable', 'date_format:Y-m-d'], 'occurred_at' => ['required', 'date', 'before_or_equal:now'], 'next_due_date' => ['nullable', 'date_format:Y-m-d'], 'notes' => ['nullable', 'string', 'max:5000']])->validate();

        return DB::transaction(function () use ($patient, $user, $provider, $data) {
            $this->active($patient);
            $record = MedicationAdministration::create([...$data, 'patient_id' => $patient->id, 'provider_id' => $provider->id, 'provider_name' => $provider->name, 'author_user_id' => $user->id]);
            Activity::log($record, 'administration.recorded', 'Administration recorded', $user);

            return $record;
        });
    }
}
