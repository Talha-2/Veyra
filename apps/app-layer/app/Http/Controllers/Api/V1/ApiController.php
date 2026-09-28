<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApiKey;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\Cursor;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\ValidationException;

/**
 * Shared shape of the public API: validation that always answers in the API's
 * error format, cursor-paginated lists, and tenant-confined `exists` rules.
 */
abstract class ApiController extends Controller
{
    /** Validate or throw; the exception is rendered as a 422 with `fields`. */
    protected function check(Request $request, array $rules, array $messages = []): array
    {
        return Validator::make($request->all(), $rules, $messages)->validate();
    }

    /**
     * `exists` limited to the key's organization. The framework rule queries
     * the table directly and would happily accept another tenant's id.
     */
    protected function ours(string $table, bool $softDeletes = false): Exists
    {
        $rule = (new Exists($table, 'id'))->where('organization_id', Organization::currentId());

        return $softDeletes ? $rule->whereNull('deleted_at') : $rule;
    }

    protected function key(Request $request): ApiKey
    {
        return $request->attributes->get('api_key');
    }

    /**
     * A page of a list, newest first, with an opaque cursor for the next one.
     *
     * @param  class-string<\App\Http\Resources\V1\ApiResource>  $resource
     */
    protected function list(Request $request, Builder $query, string $resource): JsonResponse
    {
        $validated = $this->check($request, [
            'limit' => ['sometimes', 'integer', 'min:1', 'max:'.config('public_api.max_page_size', 100)],
            'cursor' => ['sometimes', 'string', 'max:500'],
            'updated_since' => ['sometimes', 'date'],
        ]);

        $cursor = null;
        if (isset($validated['cursor'])) {
            $cursor = Cursor::fromEncoded($validated['cursor']);
            if (! $cursor) {
                throw ValidationException::withMessages(['cursor' => 'That cursor is not valid. Pass next_cursor from the previous page unchanged.']);
            }
        }

        if (isset($validated['updated_since'])) {
            $query->where($query->getModel()->qualifyColumn('updated_at'), '>=', \Illuminate\Support\Carbon::parse($validated['updated_since'])->utc());
        }

        $page = $query->orderByDesc('id')->cursorPaginate(
            perPage: (int) ($validated['limit'] ?? config('public_api.page_size', 25)),
            cursor: $cursor,
        );

        return response()->json([
            'object' => 'list',
            'data' => $resource::collection($page->items())->resolve($request),
            'has_more' => $page->hasMorePages(),
            'next_cursor' => $page->nextCursor()?->encode(),
        ]);
    }

    protected function deleted(string $object, int $id): JsonResponse
    {
        return response()->json(['id' => $id, 'object' => $object, 'deleted' => true]);
    }
}
