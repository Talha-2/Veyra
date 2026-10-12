<?php

namespace App\Http\Requests\Desk;

use App\Services\Healthcare\ProviderDirectory;
use Illuminate\Foundation\Http\FormRequest;

class StoreProviderRequest extends FormRequest
{
    public function rules(): array
    {
        return ProviderDirectory::rules();
    }
}
