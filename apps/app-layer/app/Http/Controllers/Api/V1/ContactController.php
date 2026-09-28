<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ContactStage;
use App\Enums\IdentifierType;
use App\Http\Resources\V1\ContactResource;
use App\Models\Activity;
use App\Models\Contact;
use App\Models\Identifier;
use App\Support\PublicApi\ApiError;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ContactController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $filters = $this->check($request, [
            'q' => ['sometimes', 'string', 'max:120'],
            'stage' => ['sometimes', Rule::enum(ContactStage::class)],
            'email' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:32'],
        ]);

        $query = Contact::query()->with('tags')
            ->when($filters['stage'] ?? null, fn ($q, $s) => $q->where('stage', $s))
            ->when($filters['email'] ?? null, fn ($q, $e) => $q->where('email', IdentifierType::Email->normalize($e)))
            ->when($filters['phone'] ?? null, fn ($q, $p) => $q->where('phone', IdentifierType::Phone->normalize($p)))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower($term)).'%';
                $q->where(fn ($w) => $w->whereRaw('lower(name) like ?', [$like])->orWhereRaw('lower(email) like ?', [$like])
                    ->orWhereRaw('lower(company) like ?', [$like])->orWhere('phone', 'like', $like));
            });

        return $this->list($request, $query, ContactResource::class);
    }

    /**
     * Find a contact by phone or email: the contact's own fields first, then
     * any identifier linked to a contact (a number they called from, an
     * address they wrote from).
     */
    public function lookup(Request $request): JsonResponse
    {
        $v = $this->check($request, [
            'phone' => ['required_without:email', 'nullable', 'string', 'max:32'],
            'email' => ['required_without:phone', 'nullable', 'email', 'max:255'],
        ]);

        $type = ! empty($v['phone']) ? IdentifierType::Phone : IdentifierType::Email;
        $value = $type->normalize($v['phone'] ?? $v['email']);
        $column = $type === IdentifierType::Phone ? 'phone' : 'email';

        $contact = Contact::query()->with('tags')->where($column, $value)->first()
            ?? Identifier::query()->where('type', $type)->where('value', $value)->whereNotNull('contact_id')->first()?->contact?->load('tags');

        if (! $contact) {
            return ApiError::make(404, "No contact has the {$column} {$value}.");
        }

        return response()->json(new ContactResource($contact));
    }

    public function show(Contact $contact): JsonResponse
    {
        return response()->json(new ContactResource($contact->load('tags')));
    }

    public function store(Request $request): JsonResponse
    {
        $v = $this->check($request, $this->rules(), [
            'name.required_without_all' => 'Give the contact a name, a phone number or an email address.',
        ]);
        $attributes = $this->normalize($v);
        $this->ensureUnique($attributes);

        $contact = DB::transaction(function () use ($attributes, $v) {
            $contact = Contact::create([...collect($attributes)->except('tags')->all(), 'source' => $attributes['source'] ?? 'api']);
            if (isset($v['tags'])) {
                $contact->syncTags($v['tags']);
            }
            $this->linkIdentifiers($contact);
            Activity::log($contact, 'created', 'Contact created through the API', actor: 'api');

            return $contact;
        });

        return response()->json(new ContactResource($contact->refresh()->load('tags')), 201);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        $v = $this->check($request, $this->rules(updating: true));
        $attributes = $this->normalize($v);
        $this->ensureUnique($attributes, $contact);

        DB::transaction(function () use ($contact, $attributes, $v) {
            $contact->update(collect($attributes)->except('tags')->all());
            if (array_key_exists('tags', $v)) {
                $contact->syncTags($v['tags'] ?? []);
            }
            $this->linkIdentifiers($contact);
            if ($contact->wasChanged()) {
                Activity::log($contact, 'updated', 'Details updated through the API: '.implode(', ', array_keys($contact->getChanges())), actor: 'api');
            }
        });

        return response()->json(new ContactResource($contact->refresh()->load('tags')));
    }

    public function destroy(Contact $contact): JsonResponse
    {
        $contact->delete();

        return $this->deleted('contact', $contact->id);
    }

    private function rules(bool $updating = false): array
    {
        $sometimes = $updating ? ['sometimes'] : [];

        return [
            'name' => [...$sometimes, ...($updating ? [] : ['required_without_all:phone,email']), 'nullable', 'string', 'max:255'],
            'phone' => [...$sometimes, 'nullable', 'string', 'max:32', 'regex:/\d{3,}/'],
            'email' => [...$sometimes, 'nullable', 'email', 'max:255'],
            'company' => [...$sometimes, 'nullable', 'string', 'max:255'],
            'stage' => [...$sometimes, Rule::enum(ContactStage::class)],
            'source' => [...$sometimes, 'string', 'max:40'],
            'value' => [...$sometimes, 'integer', 'min:0'],
            'tags' => [...$sometimes, 'nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
        ];
    }

    private function normalize(array $v): array
    {
        if (! empty($v['phone'])) {
            $v['phone'] = IdentifierType::Phone->normalize($v['phone']);
        }
        if (! empty($v['email'])) {
            $v['email'] = IdentifierType::Email->normalize($v['email']);
        }

        return $v;
    }

    /** Phone and email are unique per organization — deleted contacts included, as the database enforces it. */
    private function ensureUnique(array $attributes, ?Contact $except = null): void
    {
        $errors = [];
        foreach (['phone', 'email'] as $field) {
            if (empty($attributes[$field])) {
                continue;
            }
            $existing = Contact::withTrashed()->where($field, $attributes[$field])
                ->when($except, fn ($q) => $q->whereKeyNot($except->id))->first();
            if ($existing) {
                $errors[$field] = $existing->trashed()
                    ? "A deleted contact (id {$existing->id}) still holds this {$field}."
                    : "Contact {$existing->id} already has this {$field}. Update that one instead.";
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }

    /** Attach the contact's phone and email identifiers, so past conversations from them join its history. */
    private function linkIdentifiers(Contact $contact): void
    {
        foreach (['phone' => IdentifierType::Phone, 'email' => IdentifierType::Email] as $field => $type) {
            if (! $contact->{$field}) {
                continue;
            }
            $identifier = Identifier::resolve($type, $contact->{$field});
            if ($identifier->contact_id === null) {
                $identifier->linkTo($contact);
            }
        }
    }
}
