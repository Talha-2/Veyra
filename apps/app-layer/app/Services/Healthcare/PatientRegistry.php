<?php

namespace App\Services\Healthcare;

use App\Enums\IdentifierType;
use App\Models\Activity;
use App\Models\Contact;
use App\Models\Identifier;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\User;
use App\Services\Contacts\ContactDirectory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PatientRegistry
{
    public static function updateRules(): array
    {
        return [...self::demographicRules(), 'name' => ['sometimes', 'required', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'], 'email' => ['sometimes', 'nullable', 'email', 'max:255']];
    }

    public static function demographicRules(): array
    {
        $rules = [
            'birth_date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
            'administrative_sex' => ['nullable', Rule::in(['female', 'male', 'other', 'unknown'])],
            'preferred_language' => ['nullable', Rule::in(['en', 'ur'])],
        ];
        foreach (['address_line_1', 'address_line_2', 'city', 'province', 'postal_code', 'country', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone'] as $field) {
            $rules[$field] = ['nullable', 'string', 'max:255'];
        }
        $rules['country'] = ['sometimes', 'required', 'string', 'max:255'];

        return $rules;
    }

    public function register(array $attributes, User $actor): Patient
    {
        $this->requireTenant();
        $data = Validator::make($attributes, [
            ...self::demographicRules(), 'contact_id' => ['nullable', 'integer'],
            'name' => ['required_without:contact_id', 'nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'], 'email' => ['nullable', 'email', 'max:255'],
        ])->validate();

        return DB::transaction(function () use ($data, $actor) {
            if (! empty($data['contact_id'])) {
                $contact = Contact::query()->lockForUpdate()->find($data['contact_id']);
                if (! $contact || $contact->patient()->exists()) {
                    throw ValidationException::withMessages(['contact_id' => 'Choose an available contact in this clinic. This contact may already be registered.']);
                }
                if (blank($contact->name)) {
                    if (blank($data['name'] ?? null)) {
                        throw ValidationException::withMessages(['name' => 'Enter the patient’s full name to register this conversation profile.']);
                    }
                    $contact->update(['name' => $data['name']]);
                }
            } else {
                $directory = app(ContactDirectory::class);
                $attributes = $directory->normalize(array_intersect_key($data, array_flip(['name', 'phone', 'email'])));
                $directory->ensureUnique($attributes);
                $contact = Contact::create($attributes);
                $directory->linkIdentifiers($contact);
            }
            $patient = Patient::create([
                ...array_intersect_key($data, self::demographicRules()),
                'contact_id' => $contact->id, 'mrn' => 'P-'.strtoupper((string) Str::ulid()),
                'country' => $data['country'] ?? 'Pakistan',
            ]);
            Activity::log($patient, 'patient.registered', 'Patient registered', $actor);

            return $patient->load('contact');
        });
    }

    public function update(Patient $patient, array $attributes, User $actor): Patient
    {
        $this->requireTenant($patient);
        $data = Validator::make($attributes, self::updateRules())->validate();

        return DB::transaction(function () use ($patient, $data, $actor) {
            $patient = Patient::query()->lockForUpdate()->findOrFail($patient->id);
            $contact = $patient->contact()->lockForUpdate()->firstOrFail();
            $directory = app(ContactDirectory::class);
            $identity = $directory->normalize(array_intersect_key($data, array_flip(['name', 'phone', 'email'])));
            $directory->ensureUnique($identity, $contact);
            foreach (['phone' => IdentifierType::Phone, 'email' => IdentifierType::Email] as $field => $type) {
                if (! empty($identity[$field]) && Identifier::where('type', $type)->where('value', $identity[$field])->whereNotNull('contact_id')->where('contact_id', '!=', $contact->id)->exists()) {
                    throw ValidationException::withMessages([$field => 'This '.$field.' is linked to another patient or person. Use a different identifier.']);
                }
            }
            $contact->fill($identity);
            $identityFields = array_keys($contact->getDirty());
            $contact->save();
            $directory->linkIdentifiers($contact);
            $patient->fill(array_intersect_key($data, self::demographicRules()));
            $fields = array_keys($patient->getDirty());
            $patient->save();
            if ($fields) {
                Activity::log($patient, 'patient.updated', 'Patient demographics updated', $actor, ['fields' => $fields]);
            }
            if ($identityFields) {
                Activity::log($patient, 'patient.identity_updated', 'Patient contact details updated', $actor, ['fields' => $identityFields]);
            }

            return $patient->load('contact');
        });
    }

    public function archive(Patient $patient, User $actor): void
    {
        $this->setStatus($patient, 'archived', $actor);
    }

    public function restore(Patient $patient, User $actor): void
    {
        $this->setStatus($patient, 'active', $actor);
    }

    private function setStatus(Patient $patient, string $status, User $actor): void
    {
        $this->requireTenant($patient);
        DB::transaction(function () use ($patient, $status, $actor) {
            $patient = Patient::query()->lockForUpdate()->findOrFail($patient->id);
            if ($patient->status !== $status) {
                $patient->update(['status' => $status]);
                Activity::log($patient, 'patient.'.$status, $status === 'active' ? 'Patient restored' : 'Patient archived', $actor);
            }
        });
    }

    private function requireTenant(?Patient $patient = null): void
    {
        abort_unless(Organization::currentId() !== null && (! $patient || $patient->organization_id === Organization::currentId()), 404);
    }
}
