<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class PatientQuestionnaire extends Model
{
    use BelongsToTenant;

    protected $fillable = ['title', 'questions', 'active'];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'questions' => 'array'];
    }
}
