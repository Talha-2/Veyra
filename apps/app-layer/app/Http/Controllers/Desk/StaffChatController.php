<?php

namespace App\Http\Controllers\Desk;

use App\Http\Controllers\Controller;
use App\Models\StaffChatRoom;
use App\Services\StaffChat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class StaffChatController extends Controller
{
    public function index(Request $request, StaffChat $chat): Response
    {
        return Inertia::render('desk/chat', ['rooms' => $chat->rooms($request->user()), 'team' => $chat->team(), 'current_user_id' => $request->user()->id]);
    }

    public function rooms(Request $request, StaffChat $chat): JsonResponse
    {
        return response()->json(['rooms' => $chat->rooms($request->user())]);
    }

    public function create(Request $request, StaffChat $chat): JsonResponse
    {
        $data = $request->validate(['kind' => ['required', 'in:channel,direct'], 'name' => ['required_if:kind,channel', 'nullable', 'string', 'max:80'], 'member_ids' => ['required', 'array', 'min:1', 'max:100'], 'member_ids.*' => ['required', 'integer', 'distinct']]);
        if ($data['kind'] === 'channel' && trim($data['name']) === '') {
            throw ValidationException::withMessages(['name' => 'Give this channel a name.']);
        }

        return response()->json(['room_id' => $chat->create($request->user(), $data)->id], 201);
    }

    public function feed(Request $request, StaffChatRoom $room, StaffChat $chat): JsonResponse
    {
        $chat->authorize($request->user(), $room);
        $request->validate(['before' => ['nullable', 'integer', 'min:1'], 'after' => ['nullable', 'integer', 'min:0']]);
        $query = $room->messages()->with('user:id,name');
        if ($request->filled('after')) {
            $items = $query->where('id', '>', $request->integer('after'))->orderBy('id')->limit(101)->get();

            return response()->json(['messages' => $items->take(100)->map(fn ($m) => $chat->record($m))->values(), 'has_newer' => $items->count() > 100]);
        }
        $items = $query->when($request->filled('before'), fn ($q) => $q->where('id', '<', $request->integer('before')))->orderByDesc('id')->limit(101)->get();

        return response()->json(['messages' => $items->take(100)->reverse()->map(fn ($m) => $chat->record($m))->values(), 'has_older' => $items->count() > 100]);
    }

    public function send(Request $request, StaffChatRoom $room, StaffChat $chat): JsonResponse
    {
        $chat->authorize($request->user(), $room);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000'], 'client_id' => ['required', 'string', 'max:80']]);

        return response()->json(['message' => $chat->record($chat->send($request->user(), $room, $data))], 201);
    }

    public function read(Request $request, StaffChatRoom $room, StaffChat $chat): JsonResponse
    {
        $chat->authorize($request->user(), $room);
        $data = $request->validate(['message_id' => ['required', 'integer', 'min:1']]);
        abort_unless($room->messages()->whereKey($data['message_id'])->exists(), 422, 'This message does not belong to this conversation.');
        DB::transaction(function () use ($room, $request, $data) {
            $participant = $room->participants()->where('user_id', $request->user()->id)->lockForUpdate()->firstOrFail();
            if ($data['message_id'] > $participant->last_read_message_id) {
                $participant->update(['last_read_message_id' => $data['message_id']]);
            }
        });

        return response()->json(['ok' => true]);
    }
}
