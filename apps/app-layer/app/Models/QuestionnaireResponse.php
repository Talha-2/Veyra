<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class QuestionnaireResponse extends Model
{
    use BelongsToTenant;

    protected $fillable = ['patient_id', 'patient_questionnaire_id', 'recorded_by', 'recorder_name', 'title', 'questions', 'answers', 'source'];

    protected function casts(): array
    {
        return ['questions' => 'array', 'answers' => 'array'];
    }
}
