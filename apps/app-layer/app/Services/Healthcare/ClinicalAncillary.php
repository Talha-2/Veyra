<?php

namespace App\Services\Healthcare;

use App\Models\Activity;
use App\Models\ClinicalEncounter;
use App\Models\DiagnosticOrder;
use App\Models\Organization;
use App\Models\Patient;
use App\Models\PatientDocument;
use App\Models\PatientReferral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ClinicalAncillary
{
    public function __construct(private ClinicalRecords $records, private ClinicOperations $operations) {}

    public function visible(Builder $query, User $actor): Builder
    {
        $provider = $this->records->provider($actor);
        $issuedColumn = $query->getModel() instanceof DiagnosticOrder ? 'ordered_at' : 'issued_at';
        $query->where(fn (Builder $q) => $q->whereNotNull($issuedColumn)->orWhere(fn (Builder $draft) => $draft->where('provider_id', $provider->id)->where('author_user_id', $actor->id)));

        return $query->where(fn (Builder $q) => $q->whereNull('clinical_encounter_id')->orWhereHas('encounter', fn (Builder $e) => $e->where('status', 'signed')->orWhere(fn (Builder $own) => $own->where('provider_id', $provider->id)->where('author_user_id', $actor->id))));
    }

    public function assertRead(Model $record, User $actor): void
    {
        $provider = $this->records->provider($actor);
        abort_unless($record->organization_id === Organization::currentId(), 404);
        $issued = $record instanceof PatientDocument || ($record instanceof DiagnosticOrder ? $record->ordered_at !== null : $record->issued_at !== null);
        abort_unless($issued || ($record->provider_id === $provider->id && $record->author_user_id === $actor->id), 403);
        if ($record->clinical_encounter_id) {
            $encounter = ClinicalEncounter::findOrFail($record->clinical_encounter_id);
            abort_unless($encounter->patient_id === $record->patient_id, 404);
            $this->records->assertRead($encounter, $actor);
        }
    }

    private function assertAuthor(Model $record, User $actor): void
    {
        $this->assertRead($record, $actor);
        $provider = $this->records->provider($actor);
        abort_unless($record->provider_id === $provider->id && $record->author_user_id === $actor->id, 403);
    }

    private function context(array $attributes, User $actor): array
    {
        $provider = $this->records->provider($actor);
        $data = Validator::make($attributes, ['patient_id' => ['required', 'integer'], 'clinical_encounter_id' => ['nullable', 'integer']])->validate();
        $patient = Patient::findOrFail($data['patient_id']);
        if ($patient->status !== 'active') {
            throw ValidationException::withMessages(['patient_id' => 'Restore the patient before adding clinical records.']);
        }
        if (! empty($data['clinical_encounter_id'])) {
            $encounter = ClinicalEncounter::findOrFail($data['clinical_encounter_id']);
            $this->records->assertRead($encounter, $actor);
            if ($encounter->patient_id !== $patient->id) {
                throw ValidationException::withMessages(['clinical_encounter_id' => 'Choose an accessible consultation for this patient.']);
            }
        }

        return [...$data, 'clinical_encounter_id' => $data['clinical_encounter_id'] ?? null, 'provider_id' => $provider->id, 'author_user_id' => $actor->id, 'provider_name' => $provider->name, 'author_name' => $actor->name];
    }

    public function createOrder(array $attributes, User $actor): DiagnosticOrder
    {
        $context = $this->context($attributes, $actor);
        $data = Validator::make($attributes, ['kind' => ['required', Rule::in(['lab', 'imaging'])], 'name' => ['required', 'string', 'max:255'], 'indication' => ['required', 'string', 'max:10000'], 'priority' => ['required', Rule::in(['routine', 'urgent'])]])->validate();

        return DB::transaction(function () use ($context, $data, $actor) {
            $order = DiagnosticOrder::create([...$context, ...$data]);
            Activity::log($order, 'diagnostic.created', 'Diagnostic draft created', $actor);

            return $order;
        });
    }

    public function transitionOrder(DiagnosticOrder $order, array $attributes, User $actor): void
    {
        $this->assertAuthor($order, $actor);
        $data = Validator::make($attributes, ['version' => ['required', 'integer', 'min:1'], 'action' => ['required', Rule::in(['order', 'result', 'review', 'cancel'])]])->validate();
        DB::transaction(function () use ($order, $data, $attributes, $actor) {
            $locked = DiagnosticOrder::lockForUpdate()->findOrFail($order->id);
            $this->assertAuthor($locked, $actor);
            $this->assertVersion($locked, $data);
            $action = $data['action'];
            $allowed = match ($action) {
                'order' => ['draft'], 'result' => ['ordered'], 'review' => ['resulted'], 'cancel' => ['draft', 'ordered'], default => []
            };
            if (! in_array($locked->status, $allowed, true)) {
                throw ValidationException::withMessages(['action' => 'This action is unavailable for the current order state.']);
            }
            $change = ['version' => $locked->version + 1];
            if ($action === 'result') {
                $result = Validator::make($attributes, ['result' => ['required', 'string', 'max:20000'], 'result_flag' => ['required', Rule::in(['normal', 'abnormal', 'critical', 'not_applicable'])]])->validate();
                $change += [...$result, 'status' => 'resulted', 'resulted_at' => now(), 'resulted_by' => $actor->id];
            } elseif ($action === 'review') {
                $today = CarbonImmutable::now(Organization::current()->timezone ?: 'Asia/Karachi')->format('Y-m-d');
                $review = Validator::make($attributes, ['review_note' => ['required', 'string', 'max:10000'],
                    'patient_contact_status' => ['nullable', Rule::in(['not_recorded', 'contacted', 'attempted', 'not_required'])],
                    'follow_up' => ['nullable', 'array:assigned_user_id,due_on'],
                    'follow_up.assigned_user_id' => ['required_with:follow_up', 'integer'],
                    'follow_up.due_on' => ['required_with:follow_up', 'date_format:Y-m-d', 'after_or_equal:'.$today]])->validate();
                $change += ['review_note' => $review['review_note'], 'patient_contact_status' => $review['patient_contact_status'] ?? 'not_recorded', 'status' => 'reviewed', 'reviewed_at' => now(), 'reviewed_by' => $actor->id];
                if (! empty($review['follow_up'])) {
                    try {
                        $task = $this->operations->task([...$review['follow_up'], 'patient_id' => $locked->patient_id, 'kind' => 'recall', 'title' => 'Arrange provider follow-up'], $actor);
                        $change['follow_up_task_id'] = $task->id;
                    } catch (ValidationException $error) {
                        $messages = [];
                        foreach ($error->errors() as $key => $value) {
                            $messages[$key === 'patient_id' ? 'follow_up' : 'follow_up.'.$key] = $value;
                        }
                        throw ValidationException::withMessages($messages);
                    }
                }
            } elseif ($action === 'cancel') {
                $reason = Validator::make($attributes, ['reason' => ['required', 'string', 'max:2000']])->validate();
                $change += ['status' => 'cancelled', 'cancelled_at' => now(), 'cancelled_by' => $actor->id, 'cancellation_reason' => $reason['reason']];
            } else {
                $change += ['status' => 'ordered', 'ordered_at' => now()];
            }
            $locked->update($change);
            Activity::log($locked, 'diagnostic.'.$action, 'Diagnostic workflow updated: '.$action, $actor);
        });
    }

    public function saveDraft(Model $record, array $attributes, User $actor): void
    {
        $this->assertAuthor($record, $actor);
        $rules = $record instanceof DiagnosticOrder
            ? ['name' => ['required', 'string', 'max:255'], 'indication' => ['required', 'string', 'max:10000'], 'priority' => ['required', Rule::in(['routine', 'urgent'])]]
            : ['recipient' => ['required', 'string', 'max:255'], 'reason' => ['required', 'string', 'max:10000'], 'letter' => ['required', 'string', 'max:20000']];
        $data = Validator::make($attributes, [...$rules, 'version' => ['required', 'integer', 'min:1']])->validate();
        DB::transaction(function () use ($record, $data, $actor) {
            $locked = $record->newQuery()->lockForUpdate()->findOrFail($record->id);
            $this->assertAuthor($locked, $actor);
            $this->assertVersion($locked, $data);
            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages(['record' => 'Issued records are locked. Create a new draft instead.']);
            }
            $locked->update([...collect($data)->except('version')->all(), 'version' => $locked->version + 1]);
            Activity::log($locked, 'clinical.draft_updated', 'Clinical draft updated', $actor);
        });
    }

    private function assertVersion(Model $record, array $data): void
    {
        if ($record->version !== (int) $data['version']) {
            throw ValidationException::withMessages(['version' => 'This record changed. Reload before continuing.']);
        }
    }

    public function upload(array $attributes, User $actor): PatientDocument
    {
        $context = $this->context($attributes, $actor);
        $data = Validator::make($attributes, ['title' => ['required', 'string', 'max:255'], 'category' => ['required', Rule::in(['lab_report', 'imaging_report', 'consent', 'outside_record', 'other'])], 'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'extensions:pdf,jpg,jpeg,png', 'max:10240']])->validate();
        /** @var UploadedFile $file */
        $file = $data['file'];
        $path = $file->store('clinical-documents/'.Organization::currentId(), 'local');
        if (! $path) {
            throw ValidationException::withMessages(['file' => 'Upload failed. Please retry.']);
        }
        try {
            return DB::transaction(function () use ($context, $data, $file, $path, $actor) {
                $document = PatientDocument::create([...$context, 'title' => $data['title'], 'category' => $data['category'], 'original_name' => basename(str_replace('\\', '/', $file->getClientOriginalName())), 'storage_path' => $path, 'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getRealPath())]);
                Activity::log($document, 'clinical.document_uploaded', 'Patient document uploaded', $actor);

                return $document;
            });
        } catch (\Throwable $error) {
            Storage::disk('local')->delete($path);
            throw $error;
        }
    }

    public function createReferral(array $attributes, User $actor): PatientReferral
    {
        $context = $this->context($attributes, $actor);
        $data = Validator::make($attributes, ['recipient' => ['required', 'string', 'max:255'], 'reason' => ['required', 'string', 'max:10000'], 'letter' => ['required', 'string', 'max:20000']])->validate();

        return DB::transaction(function () use ($context, $data, $actor) {
            $referral = PatientReferral::create([...$context, ...$data]);
            Activity::log($referral, 'referral.created', 'Referral draft created', $actor);

            return $referral;
        });
    }

    public function transitionReferral(PatientReferral $referral, array $attributes, User $actor): void
    {
        $this->assertAuthor($referral, $actor);
        $data = Validator::make($attributes, ['version' => ['required', 'integer', 'min:1'], 'action' => ['required', Rule::in(['issue', 'revoke'])]])->validate();
        DB::transaction(function () use ($referral, $attributes, $data, $actor) {
            $locked = PatientReferral::lockForUpdate()->findOrFail($referral->id);
            $this->assertAuthor($locked, $actor);
            $this->assertVersion($locked, $data);
            if (($data['action'] === 'issue' && $locked->status !== 'draft') || ($data['action'] === 'revoke' && $locked->status !== 'issued')) {
                throw ValidationException::withMessages(['action' => 'This action is unavailable for the current referral state.']);
            }
            $change = ['version' => $locked->version + 1];
            if ($data['action'] === 'issue') {
                $change += ['status' => 'issued', 'issued_at' => now(), 'issued_by' => $actor->id];
            } else {
                $reason = Validator::make($attributes, ['reason' => ['required', 'string', 'max:2000']])->validate();
                $change += ['status' => 'revoked', 'revoked_at' => now(), 'revoked_by' => $actor->id, 'revocation_reason' => $reason['reason']];
            }
            $locked->update($change);
            Activity::log($locked, 'referral.'.$data['action'], 'Referral '.$data['action'], $actor);
        });
    }

    public function coordinateReferral(PatientReferral $referral, array $attributes, User $actor): void
    {
        $this->assertAuthor($referral, $actor);
        $today = CarbonImmutable::now(Organization::current()->timezone ?: 'Asia/Karachi')->format('Y-m-d');
        $data = Validator::make($attributes, ['version' => ['required', 'integer', 'min:1'], 'status' => ['required', Rule::in(['scheduled', 'completed', 'declined'])], 'note' => ['required', 'string', 'max:10000'],
            'scheduled_on' => ['nullable', 'required_if:status,scheduled', 'date_format:Y-m-d', ...(($attributes['status'] ?? null) === 'scheduled' ? ['after_or_equal:'.$today] : [])]])->validate();
        DB::transaction(function () use ($referral, $data, $actor) {
            $patient = Patient::lockForUpdate()->findOrFail($referral->patient_id);
            $locked = PatientReferral::lockForUpdate()->findOrFail($referral->id);
            $this->assertAuthor($locked, $actor);
            $this->assertVersion($locked, $data);
            if ($locked->status !== 'issued') {
                throw ValidationException::withMessages(['referral' => 'Only issued referrals can receive coordination updates.']);
            }
            if (! in_array($locked->coordination_status, ['pending', 'scheduled'], true)) {
                throw ValidationException::withMessages(['status' => 'This referral outcome is complete. Create a new referral for further care.']);
            }
            if ($data['status'] === 'scheduled' && $patient->status !== 'active') {
                throw ValidationException::withMessages(['patient' => 'Restore this patient before scheduling a new specialist visit.']);
            }
            $scheduledOn = $data['status'] === 'scheduled' ? $data['scheduled_on'] : $locked->scheduled_on;
            $locked->update(['coordination_status' => $data['status'], 'scheduled_on' => $scheduledOn, 'version' => $locked->version + 1]);
            $locked->updates()->create(['status' => $data['status'], 'scheduled_on' => $scheduledOn, 'note' => $data['note'], 'recorded_by_id' => $actor->id, 'recorded_by_name' => $actor->name]);
            Activity::log($locked, 'referral.coordination_updated', 'Referral coordination updated', $actor);
        });
    }
}
