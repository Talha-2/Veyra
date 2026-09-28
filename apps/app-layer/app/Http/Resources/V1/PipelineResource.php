<?php

namespace App\Http\Resources\V1;

use App\Models\Pipeline;
use App\Models\PipelineStage;
use Illuminate\Http\Request;

/** @mixin Pipeline */
class PipelineResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'object' => 'pipeline',
            'name' => $this->name,
            'is_default' => (bool) $this->is_default,
            'stages' => $this->stages->map(fn (PipelineStage $s) => [
                'id' => $s->id, 'object' => 'pipeline_stage', 'name' => $s->name, 'color' => $s->color, 'position' => (int) $s->position,
            ])->values()->all(),
            'created_at' => self::time($this->created_at),
            'updated_at' => self::time($this->updated_at),
        ];
    }
}
