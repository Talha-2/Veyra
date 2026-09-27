<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Models\SiteInquiry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * The company website's contact and demo form.
 *
 * Public and unauthenticated by design, so it is narrow: a throttle per IP
 * (on the route), a honeypot field bots fill and people never see, and a
 * JSON contract the site renders field by field. A request the honeypot
 * catches gets the same 201 as a real one, so a bot learns nothing.
 */
class InquiryController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        if (filled($request->input('website'))) {
            return response()->json(['ok' => true], 201);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:190'],
            'company' => ['nullable', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:40', 'regex:/^[0-9+().\-\s]{5,40}$/'],
            'topic' => ['required', Rule::in(SiteInquiry::TOPICS)],
            'message' => ['nullable', 'string', 'max:5000'],
            'page' => ['nullable', 'string', 'max:120'],
        ], [
            'phone.regex' => 'Use digits, spaces and + ( ) - only.',
        ]);

        $inquiry = SiteInquiry::create([
            ...$validated,
            'email' => strtolower($validated['email']),
            'ip_hash' => $request->ip() ? hash_hmac('sha256', $request->ip(), (string) config('app.key')) : null,
            'user_agent' => str((string) $request->userAgent())->limit(250)->value() ?: null,
        ]);

        Log::info('site.inquiry', ['id' => $inquiry->id, 'topic' => $inquiry->topic]);

        return response()->json(['ok' => true], 201);
    }
}
