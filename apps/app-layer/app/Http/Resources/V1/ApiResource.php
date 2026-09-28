<?php

namespace App\Http\Resources\V1;

use DateTimeInterface;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Base for every public API object.
 *
 * Unwrapped (a single object is the object, not `{data: …}`); lists are
 * wrapped by the controller as `{object: "list", data, next_cursor, has_more}`.
 * Every object carries `object`, `id`, `created_at` and `updated_at`, with
 * times in ISO 8601 UTC.
 */
abstract class ApiResource extends JsonResource
{
    public static $wrap = null;

    protected static function time(?DateTimeInterface $at): ?string
    {
        return $at ? \Illuminate\Support\Carbon::instance($at)->utc()->toIso8601ZuluString() : null;
    }

    /** The object as a plain array, for webhook payloads and nesting. */
    public function toPayload(): array
    {
        return json_decode(json_encode($this->resolve()), true);
    }
}
