<?php

namespace App\Services\LiveKit;

use RuntimeException;

/**
 * A LiveKit access token: an HS256 JWT signed with the project's API secret.
 *
 * Small enough to write out rather than pull a JWT library: LiveKit reads
 * `iss` (the API key), `sub` (the participant identity), the `video` grant
 * that says which room it may join and what it may publish, and optional
 * participant `attributes`, which the voice worker trusts because only a
 * token signed here can carry them (participants cannot edit their own
 * attributes without the canUpdateOwnMetadata grant, which this never sets).
 */
final class AccessToken
{
    public static function configured(): bool
    {
        return filled(config('services.livekit.url')) && filled(config('services.livekit.key')) && filled(config('services.livekit.secret'));
    }

    /**
     * @param  array<string, string>  $attributes
     */
    public static function forRoom(string $room, string $identity, string $name, array $attributes = [], int $ttlSeconds = 3600): string
    {
        if (! self::configured()) {
            throw new RuntimeException('LiveKit is not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).');
        }

        $now = time();
        $claims = [
            'iss' => config('services.livekit.key'),
            'sub' => $identity,
            'name' => $name,
            'nbf' => $now - 5,
            'exp' => $now + $ttlSeconds,
            'video' => [
                'room' => $room,
                'roomJoin' => true,
                'canPublish' => true,
                'canSubscribe' => true,
                'canPublishData' => true,
            ],
        ];
        if ($attributes) {
            $claims['attributes'] = $attributes;
        }

        $segments = [
            self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])),
            self::b64(json_encode($claims, JSON_UNESCAPED_SLASHES)),
        ];
        $segments[] = self::b64(hash_hmac('sha256', implode('.', $segments), (string) config('services.livekit.secret'), true));

        return implode('.', $segments);
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
