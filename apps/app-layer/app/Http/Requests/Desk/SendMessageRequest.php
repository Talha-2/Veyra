<?php

namespace App\Http\Requests\Desk;

use App\Models\Conversation;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class SendMessageRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'max:10000'],
            'to_address' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            /** @var Conversation|null $conversation */
            $conversation = $this->route('conversation');

            if (! $conversation) {
                return;
            }

            // A call cannot be replied to in text, and a web chat needs a live
            // visitor session that has almost certainly ended. Blocking it here
            // rather than in the UI means an operator cannot type a reply that
            // silently goes nowhere.
            if (! $conversation->channel->isComposable()) {
                $validator->errors()->add(
                    'body',
                    "You cannot send a message on a {$conversation->channel->label()} conversation.",
                );
            }
        });
    }
}
