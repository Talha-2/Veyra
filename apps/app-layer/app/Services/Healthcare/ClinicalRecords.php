<?php

namespace App\Services\Healthcare;

use App\Enums\Surface;
use App\Models\Activity;
use App\Models\Appointment;
use App\Models\ClinicalEncounter;
use App\Models\EncounterAmendment;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientAllergy;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ClinicalRecords
{
    public function provider(User $actor): Provider
    {
        abort_unless(Organization::currentId() && $actor->canAccessSurface(Surface::Desk), 403);
        $providers = Provider::where('user_id', $actor->id)->where('active', true)->get();
        abort_unless($providers->count() === 1, 403, 'Your account must be linked to one active provider in this clinic.');

        return $providers->first();
    }

    public function canAccess(User $actor): bool
    {
        return Organization::currentId() && $actor->canAccessSurface(Surface::Desk)
            && Provider::where('user_id', $actor->id)->where('active', true)->count() === 1;
    }

    public function assertRead(ClinicalEncounter $encounter, User $actor): Provider
    {
        $provider = $this->provider($actor);
        abort_unless($encounter->organization_id === Organization::currentId(), 404);
        abort_unless($encounter->status === 'signed' || ($encounter->provider_id === $provider->id && $encounter->author_user_id === $actor->id), 403);

        return $provider;
    }

    private function assertAuthor(ClinicalEncounter $encounter, User $actor): void
    {
        $provider = $this->assertRead($encounter, $actor);
        abort_unless($encounter->provider_id === $provider->id && $encounter->author_user_id === $actor->id, 403);
    }

    public function start(Patient $patient, array $attributes, User $actor): ClinicalEncounter
    {
        $provider = $this->provider($actor);
        abort_unless($patient->organization_id === Organization::currentId(), 404);
        $data = Validator::make($attributes, ['appointment_id' => ['nullable', 'integer'], 'expected_status' => ['nullable', Rule::in(['booked', 'checked_in', 'completed'])]])->validate();

        return DB::transaction(function () use ($patient, $provider, $data, $actor) {
            $patient = Patient::lockForUpdate()->findOrFail($patient->id);
            if ($patient->status !== 'active') {
                throw ValidationException::withMessages(['patient' => 'Restore this patient before starting a consultation.']);
            }
            $appointment = null;
            if (! empty($data['appointment_id'])) {
                $appointment = Appointment::lockForUpdate()->find($data['appointment_id']);
                if (! $appointment || $appointment->patient_id !== $patient->id || $appointment->provider_id !== $provider->id || in_array($appointment->status, ['cancelled', 'no_show'])) {
                    throw ValidationException::withMessages(['appointment_id' => 'Choose this provider’s appointment for this patient.']);
                }
                if (isset($data['expected_status']) && $appointment->status !== $data['expected_status']) {
                    throw ValidationException::withMessages(['expected_status' => 'This visit changed in another window. Refresh before opening the consultation.']);
                }
                $existing = ClinicalEncounter::where('appointment_id', $appointment->id)->first();
                if ($existing) {
                    $this->assertRead($existing, $actor);
                    if ($appointment->status === 'checked_in' && ! $appointment->consultation_started_at) {
                        $appointment->forceFill(['consultation_started_at' => now()])->save();
                    }

                    return $existing;
                }
            }
            $encounter = ClinicalEncounter::create(['patient_id' => $patient->id, 'provider_id' => $provider->id,
                'author_user_id' => $actor->id, 'provider_name' => $provider->name, 'author_name' => $actor->name,
                'appointment_id' => $appointment?->id, 'occurred_at' => now(), 'status' => 'draft', 'version' => 1]);
            Activity::log($encounter, 'encounter.created', 'Clinical encounter started', $actor);
            if ($appointment?->status === 'checked_in' && ! $appointment->consultation_started_at) {
                $appointment->forceFill(['consultation_started_at' => now()])->save();
            }

            return $encounter;
        });
    }

    public static function noteRules(): array
    {
        $rules = ['version' => ['required', 'integer', 'min:1'], 'allergy_status' => ['required', Rule::in(['not_reviewed', 'unknown', 'none_known', 'known'])],
            'allergies' => ['required_if:allergy_status,known', 'nullable', 'string', 'max:10000'], 'vitals' => ['nullable', 'array:temperature_c,pulse_bpm,respiratory_rate,oxygen_percent,systolic_mmhg,diastolic_mmhg,weight_kg,height_cm']];
        foreach (['chief_complaint', 'history', 'subjective', 'objective', 'assessment', 'plan'] as $field) {
            $rules[$field] = ['nullable', 'string', 'max:20000'];
        }
        foreach (['temperature_c' => '25,45', 'pulse_bpm' => '1,300', 'respiratory_rate' => '1,120', 'oxygen_percent' => '0,100', 'systolic_mmhg' => '20,350', 'diastolic_mmhg' => '10,250', 'weight_kg' => '0.1,700', 'height_cm' => '10,300'] as $field => $range) {
            $rules['vitals.'.$field] = ['nullable', 'numeric', 'between:'.$range];
        }

        return $rules;
    }

    private function version(ClinicalEncounter $encounter, array $data): void
    {
        if ($encounter->version !== (int) $data['version']) {
            throw ValidationException::withMessages(['version' => 'This note changed in another window. Reload before editing or signing.']);
        }
    }

    public function save(ClinicalEncounter $encounter, array $attributes, User $actor): void
    {
        $this->assertAuthor($encounter, $actor);
        $data = Validator::make($attributes, self::noteRules())->validate();
        DB::transaction(function () use ($encounter, $data, $actor) {
            $locked = ClinicalEncounter::lockForUpdate()->findOrFail($encounter->id);
            $this->assertAuthor($locked, $actor);
            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages(['encounter' => 'Signed notes are locked. Add an amendment instead.']);
            }
            $this->version($locked, $data);
            $locked->fill(collect($data)->except('version')->all());
            $locked->version++;
            $locked->save();
            Activity::log($locked, 'encounter.updated', 'Clinical draft saved', $actor);
        });
    }

    public function sign(ClinicalEncounter $encounter, array $attributes, User $actor): void
    {
        $this->assertAuthor($encounter, $actor);
        $data = Validator::make($attributes, ['version' => ['required', 'integer', 'min:1']])->validate();
        DB::transaction(function () use ($encounter, $data, $actor) {
            Patient::lockForUpdate()->findOrFail($encounter->patient_id);
            $locked = ClinicalEncounter::lockForUpdate()->findOrFail($encounter->id);
            $this->assertAuthor($locked, $actor);
            $this->version($locked, $data);
            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages(['encounter' => 'This encounter is already signed.']);
            }
            $errors = $this->signingErrors($locked);
            if ($errors !== []) {
                throw ValidationException::withMessages($errors);
            }
            $locked->update(['status' => 'signed', 'signed_at' => now(), 'version' => $locked->version + 1]);
            Activity::log($locked, 'encounter.signed', 'Clinical encounter signed', $actor);
        });
    }

    public function complete(ClinicalEncounter $encounter, array $attributes, User $actor): void
    {
        $this->assertAuthor($encounter, $actor);
        Validator::make($attributes, ['confirmed' => ['required', 'accepted']])->validate();
        DB::transaction(function () use ($encounter, $attributes, $actor) {
            Patient::lockForUpdate()->findOrFail($encounter->patient_id);
            $this->save($encounter, $attributes, $actor);
            $this->sign($encounter, ['version' => (int) $attributes['version'] + 1], $actor);
        });
    }

    public function readiness(ClinicalEncounter $encounter, User $actor): array
    {
        $this->assertRead($encounter, $actor);
        $errors = $encounter->status === 'draft' ? $this->signingErrors($encounter) : [];

        return ['ready' => $encounter->status === 'draft' && $errors === [], 'errors' => $errors];
    }

    private function signingErrors(ClinicalEncounter $encounter): array
    {
        $validator = Validator::make($encounter->toArray(), ['chief_complaint' => ['required', 'string'], 'assessment' => ['required', 'string'], 'plan' => ['required', 'string'],
            'allergy_status' => ['required', Rule::in(['unknown', 'none_known', 'known'])], 'allergies' => ['required_if:allergy_status,known']]);
        $errors = $validator->errors()->messages();
        if ($encounter->allergy_status === 'none_known' && PatientAllergy::where('patient_id', $encounter->patient_id)->where('status', 'active')->exists()) {
            $errors['allergy_status'] = ['Active allergy entries exist in this patient’s chart. Review them before signing, or mark outdated entries inactive with a reason.'];
        }

        return array_map(fn (array $messages) => $messages[0], $errors);
    }

    public function amend(ClinicalEncounter $encounter, array $attributes, User $actor): void
    {
        $this->assertAuthor($encounter, $actor);
        $data = Validator::make($attributes, ['reason' => ['required', 'string', 'max:2000'], 'content' => ['required', 'string', 'max:20000']])->validate();
        DB::transaction(function () use ($encounter, $data, $actor) {
            $locked = ClinicalEncounter::lockForUpdate()->findOrFail($encounter->id);
            $this->assertAuthor($locked, $actor);
            if ($locked->status !== 'signed') {
                throw ValidationException::withMessages(['encounter' => 'Sign the consultation before adding an amendment.']);
            }
            EncounterAmendment::create([...$data, 'clinical_encounter_id' => $locked->id, 'author_user_id' => $actor->id, 'author_name' => $actor->name]);
            Activity::log($locked, 'encounter.amended', 'Signed encounter amended', $actor);
        });
    }
}
