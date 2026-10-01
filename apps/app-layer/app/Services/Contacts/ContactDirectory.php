<?php

namespace App\Services\Contacts;

use App\Enums\IdentifierType;
use App\Models\Activity;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Identifier;
use Illuminate\Validation\ValidationException;

/**
 * The rules every writer of contacts shares: the public API, the agent.
 *
 * Phone and email are unique per organization (deleted contacts included,
 * because the database enforces it), always stored normalized, and a
 * contact's phone and email are linked as identifiers so the history that
 * arrived from them joins the record. Kept in one place so the agent and an
 * integration cannot disagree about what "the same person" means.
 */
class ContactDirectory
{
    public function normalize(array $attributes): array
    {
        if (! empty($attributes['phone'])) {
            $attributes['phone'] = IdentifierType::Phone->normalize($attributes['phone']);
        }
        if (! empty($attributes['email'])) {
            $attributes['email'] = IdentifierType::Email->normalize($attributes['email']);
        }

        return $attributes;
    }

    /**
     * Fields whose value already belongs to another contact, with why.
     *
     * @return array<string, string>
     */
    public function conflicts(array $attributes, ?Contact $except = null): array
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

        return $errors;
    }

    public function ensureUnique(array $attributes, ?Contact $except = null): void
    {
        if ($errors = $this->conflicts($attributes, $except)) {
            throw ValidationException::withMessages($errors);
        }
    }

    /** Attach the contact's phone and email identifiers, so past conversations from them join its history. */
    public function linkIdentifiers(Contact $contact): void
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

    /**
     * The live contact that owns this phone or email, by identifier first
     * (how a person reached us) and then by the contact's own fields.
     */
    public function findByPhoneOrEmail(?string $phone, ?string $email): ?Contact
    {
        foreach (['phone' => IdentifierType::Phone, 'email' => IdentifierType::Email] as $field => $type) {
            $value = $field === 'phone' ? $phone : $email;
            if (blank($value)) {
                continue;
            }
            $value = $type->normalize($value);
            $owner = Identifier::query()->where('type', $type)->where('value', $value)->whereNotNull('contact_id')->first()?->contact;
            if ($owner) {
                return $owner;
            }
            $byField = Contact::query()->where($field, $value)->first();
            if ($byField) {
                return $byField;
            }
            if ($field === 'phone' && ($bySuffix = $this->findByNationalNumber($value))) {
                return $bySuffix;
            }
        }

        return null;
    }

    /**
     * A number said without its country code ("773 555 0111") normalizes to
     * a different string than the one on file ("+17735550111"). Match on the
     * last ten digits, and only when that names exactly one person.
     */
    private function findByNationalNumber(string $normalized): ?Contact
    {
        $digits = preg_replace('/\D/', '', $normalized);
        if (strlen($digits) < 10) {
            return null;
        }
        $suffix = '%'.substr($digits, -10);
        $ids = Identifier::query()->where('type', IdentifierType::Phone)->where('value', 'like', $suffix)->whereNotNull('contact_id')->pluck('contact_id')
            ->merge(Contact::query()->where('phone', 'like', $suffix)->pluck('id'))
            ->unique()->values();

        return $ids->count() === 1 ? Contact::query()->find($ids->first()) : null;
    }

    /**
     * Say who this conversation is with.
     *
     * When the conversation's identifier (the number, the address, the web
     * session) belongs to nobody yet, it is linked: every earlier thread and
     * call from it joins the contact. When it already belongs to someone else
     * (a shared family phone), that link is left alone and only this
     * conversation and its calls are attributed — the agent must not move a
     * person's whole history on one caller's say-so.
     *
     * @return 'already'|'identifier'|'conversation'
     */
    public function attachConversation(Conversation $conversation, Contact $contact, string $actor = 'agent'): string
    {
        if ($conversation->contact_id === $contact->id && $conversation->identifier?->contact_id === $contact->id) {
            return 'already';
        }

        $identifier = $conversation->identifier;
        if ($identifier && ($identifier->contact_id === null || $identifier->contact_id === $contact->id)) {
            $identifier->linkTo($contact);
            // A phone number reached us before we knew whose it was: keep it on the record.
            if ($identifier->type === IdentifierType::Phone && blank($contact->phone) && ! $this->conflicts(['phone' => $identifier->value], $contact)) {
                $contact->forceFill(['phone' => $identifier->value])->save();
            }
            if ($identifier->type === IdentifierType::Email && blank($contact->email) && ! $this->conflicts(['email' => $identifier->value], $contact)) {
                $contact->forceFill(['email' => $identifier->value])->save();
            }
            $mode = 'identifier';
        } else {
            $conversation->forceFill(['contact_id' => $contact->id])->save();
            Call::query()->where('conversation_id', $conversation->id)->update(['contact_id' => $contact->id]);
            $mode = 'conversation';
        }

        Activity::log($conversation, 'contact_linked', "Linked to {$contact->displayName()}", actor: $actor, meta: ['contact_id' => $contact->id, 'mode' => $mode]);

        return $mode;
    }

    /** A phone or address with all but enough to recognise it hidden: what the agent may read back to an unverified caller. */
    public static function mask(?string $value): ?string
    {
        if (blank($value)) {
            return null;
        }
        if (str_contains($value, '@')) {
            [$local, $domain] = explode('@', $value, 2);

            return mb_substr($local, 0, 1).'•••@'.$domain;
        }

        return '•••'.mb_substr(preg_replace('/\D/', '', $value), -4);
    }
}
