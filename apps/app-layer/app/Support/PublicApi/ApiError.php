<?php

namespace App\Support\PublicApi;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * The one error shape of the public API:
 *
 *     {"error": {"type": "...", "message": "...", "fields": {...}?}}
 *
 * `type` is stable and meant for code; `message` is for the person reading
 * the log. `fields` appears only on 422, keyed by request field.
 */
class ApiError
{
    public const TYPES = [
        400 => 'invalid_request',
        401 => 'authentication_error',
        403 => 'permission_error',
        404 => 'not_found',
        405 => 'method_not_allowed',
        409 => 'conflict',
        422 => 'validation_error',
        429 => 'rate_limited',
        500 => 'api_error',
    ];

    public static function make(int $status, string $message, ?string $type = null, array $extra = []): JsonResponse
    {
        return response()->json([
            'error' => array_filter([
                'type' => $type ?? self::TYPES[$status] ?? 'api_error',
                'message' => $message,
                ...$extra,
            ], fn ($v) => $v !== null),
        ], $status);
    }

    /** @param array<string, string|list<string>> $fields */
    public static function validation(array $fields, ?string $message = null): JsonResponse
    {
        $fields = array_map(fn ($m) => is_array($m) ? $m : [$m], $fields);

        return self::make(422, $message ?? (reset($fields)[0] ?? 'The request is invalid.'), extra: ['fields' => $fields]);
    }

    /** Render any exception thrown inside /api/v1 in the API's shape. */
    public static function fromException(Throwable $e): JsonResponse
    {
        // The handler has already turned these into HTTP exceptions by the
        // time a render callback sees them; the original says more.
        if ($e instanceof HttpExceptionInterface && ($e->getPrevious() instanceof ModelNotFoundException || $e->getPrevious() instanceof AuthorizationException)) {
            $e = $e->getPrevious();
        }

        $response = match (true) {
            $e instanceof ValidationException => self::validation($e->errors(), $e->getMessage()),
            $e instanceof ModelNotFoundException => self::make(404, 'No such '.str(class_basename($e->getModel()))->snake(' ').($e->getIds() ? ' with id '.implode(', ', (array) $e->getIds()) : '').'.'),
            $e instanceof AuthenticationException => self::make(401, 'Missing or invalid API key.'),
            $e instanceof AuthorizationException => self::make(403, $e->getMessage() ?: 'This key is not allowed to do that.'),
            $e instanceof ThrottleRequestsException => self::make(429, 'Too many requests. Slow down and retry after the time in Retry-After.'),
            $e instanceof HttpExceptionInterface => self::make($e->getStatusCode(), self::httpMessage($e)),
            default => self::make(500, config('app.debug') ? $e->getMessage() : 'Something went wrong on our side. It has been logged.'),
        };

        if ($e instanceof HttpExceptionInterface) {
            $response->headers->add($e->getHeaders());
        }

        return $response;
    }

    private static function httpMessage(HttpExceptionInterface $e): string
    {
        return match ($e->getStatusCode()) {
            404 => 'No such route. See /api/v1/openapi.json for the ones that exist.',
            405 => 'That method is not allowed on this route.',
            default => $e->getMessage() ?: 'The request could not be handled.',
        };
    }
}
