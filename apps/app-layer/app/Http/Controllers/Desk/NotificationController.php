<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use App\Models\Organization;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class NotificationController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        $notifications = $user->notifications()
            ->where('data->organization_id', Organization::currentId())
            ->latest()
            ->limit(100)
            ->get()
            ->map(fn ($n) => [
                'id' => $n->id,
                'type' => $n->data['type'] ?? $n->type,
                'title' => $n->data['title'] ?? '',
                'body' => $n->data['body'] ?? null,
                'url' => $n->data['url'] ?? null,
                'read' => $n->read_at !== null,
                'at' => $n->created_at?->toIso8601String(),
            ]);

        return Inertia::render('desk/notifications', [
            'notifications' => $notifications,
            'unread' => $notifications->where('read', false)->count(),
        ]);
    }

    public function markRead(Request $request, string $id): RedirectResponse
    {
        $request->user()->notifications()->whereKey($id)->update(['read_at' => now()]);

        return back();
    }

    public function markAllRead(Request $request): RedirectResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return back();
    }

    public function preferences(Request $request): Response
    {
        $pref = NotificationPreference::firstOrCreate(
            ['user_id' => $request->user()->getKey(), 'organization_id' => Organization::currentId()],
            ['channels' => NotificationPreference::defaults()],
        );

        return Inertia::render('desk/notification-preferences', [
            'events' => collect(NotificationPreference::EVENTS)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values()->all(),
            'channels' => $pref->channels,
        ]);
    }

    public function updatePreferences(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'channels' => ['required', 'array'],
            'channels.*.in_app' => ['boolean'],
            'channels.*.email' => ['boolean'],
        ]);

        NotificationPreference::updateOrCreate(
            ['user_id' => $request->user()->getKey(), 'organization_id' => Organization::currentId()],
            ['channels' => $validated['channels']],
        );

        return back()->with('success', 'Preferences saved.');
    }
}
