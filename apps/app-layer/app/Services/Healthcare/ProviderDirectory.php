<?php

namespace App\Services\Healthcare;

use App\Models\Activity;
use App\Models\Organization;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProviderDirectory
{
    public static function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'], 'specialty' => ['nullable', 'string', 'max:255'],
            'registration_number' => ['nullable', 'string', 'max:255'], 'qualifications' => ['nullable', 'string', 'max:255'],
            'user_id' => ['nullable', 'integer', Rule::exists('memberships', 'user_id')->where('organization_id', Organization::currentId())],
            'active' => ['sometimes', 'boolean'],
            'buffer_before_minutes' => ['sometimes', 'integer', 'between:0,120', 'multiple_of:5'],
            'buffer_after_minutes' => ['sometimes', 'integer', 'between:0,120', 'multiple_of:5'],
            'minimum_notice_minutes' => ['sometimes', 'integer', 'between:0,10080'],
            'booking_horizon_days' => ['sometimes', 'integer', 'between:1,365'],
            'location_ids' => ['sometimes', 'array'], 'location_ids.*' => ['integer', Rule::exists('clinic_locations', 'id')->where('organization_id', Organization::currentId())],
            'service_ids' => ['sometimes', 'array'], 'service_ids.*' => ['integer', Rule::exists('healthcare_services', 'id')->where('organization_id', Organization::currentId())],
        ];
    }

    public function save(?Provider $provider, array $attributes, User $actor): Provider
    {
        abort_unless(Organization::currentId() && (! $provider || $provider->organization_id === Organization::currentId()), 404);
        $data = Validator::make($attributes, self::rules())->validate();

        return DB::transaction(function () use ($provider, $data, $actor) {
            if ($provider) {
                $provider = Provider::query()->lockForUpdate()->findOrFail($provider->id);
                $hasBookings = $provider->appointments()->where('status', '!=', 'cancelled')->where('ends_at', '>', now())->exists();
                if ($hasBookings && $this->changesBookingRules($provider, $data)) {
                    throw ValidationException::withMessages(['name' => 'Resolve future appointments before changing booking rules or provider assignments.']);
                }
            }
            $provider ??= new Provider;
            $provider->fill(collect($data)->except('location_ids', 'service_ids')->all())->save();
            HealthcareActions::sync();
            if (array_key_exists('location_ids', $data)) {
                $provider->locations()->sync($data['location_ids']);
            }
            if (array_key_exists('service_ids', $data)) {
                $provider->services()->sync($data['service_ids']);
            }
            Activity::log($provider, 'provider.saved', 'Provider settings saved', $actor);

            return $provider->load('locations', 'services');
        });
    }

    private function changesBookingRules(Provider $provider, array $data): bool
    {
        foreach (['active', 'buffer_before_minutes', 'buffer_after_minutes', 'minimum_notice_minutes', 'booking_horizon_days'] as $key) {
            if (array_key_exists($key, $data) && $data[$key] != $provider->$key) {
                return true;
            }
        }
        foreach (['location_ids' => 'locations', 'service_ids' => 'services'] as $key => $relation) {
            if (array_key_exists($key, $data)) {
                $old = $provider->$relation()->get()->modelKeys();
                $new = array_map('intval', $data[$key]);
                sort($old);
                sort($new);
                if ($old !== $new) {
                    return true;
                }
            }
        }

        return false;
    }
}
