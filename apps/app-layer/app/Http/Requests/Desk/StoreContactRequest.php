<?php

namespace App\Http\Requests\Desk;

use App\Enums\IdentifierType;
use App\Models\Conversation;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class StoreContactRequest extends FormRequest
{
    private ?Conversation $resolved = null;

    public function rules(): array
    {
        return [
            'name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'from_conversation_id' => ['nullable', 'integer', 'exists:conversations,id'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            // A contact with no name and no way to reach them is a row nobody
            // can ever find again.
            if (blank($this->input('name')) && blank($this->input('phone'))
                && blank($this->input('email')) && blank($this->input('from_conversation_id'))) {
                $validator->errors()->add('name', 'Give the contact a name, a phone number or an email address.');
            }
        });
    }

    public function conversation(): ?Conversation
    {
        if ($this->resolved) {
            return $this->resolved;
        }

        $id = $this->input('from_conversation_id');

        // Tenant-scoped find, so a guessed id from another organization resolves
        // to nothing rather than adopting someone else's conversation.
        return $this->resolved = $id ? Conversation::find($id) : null;
    }

    /**
     * Attributes for the new contact.
     *
     * When adopting a conversation, the identifier already holds the phone or
     * address — so it seeds the matching field rather than making the operator
     * retype what is on screen in front of them.
     */
    public function contactAttributes(): array
    {
        $attributes = $this->safe()->except('from_conversation_id');
        $identifier = $this->conversation()?->identifier;

        if ($identifier) {
            $field = match ($identifier->type) {
                IdentifierType::Phone => 'phone',
                IdentifierType::Email => 'email',
                IdentifierType::WebSession => null,
            };

            if ($field && blank($attributes[$field] ?? null)) {
                $attributes[$field] = $identifier->value;
            }
        }

        return $attributes;
    }
}
