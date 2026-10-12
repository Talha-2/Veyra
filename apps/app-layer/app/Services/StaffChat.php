<?php

namespace App\Services;

use App\Enums\Surface;
use App\Models\Activity;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\StaffChatMessage;
use App\Models\StaffChatRoom;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StaffChat
{
    public function team(): Collection
    {
        return Membership::where('organization_id', Organization::currentId())->with('user:id,name')->get()
            ->filter(fn ($membership) => $membership->canAccess(Surface::Desk))->map(fn ($m) => ['id' => $m->user_id, 'name' => $m->user->name])->sortBy('name')->values();
    }

    public function authorize(User $user, ?StaffChatRoom $room = null): void
    {
        $membership = Membership::where('organization_id', Organization::currentId())->where('user_id', $user->id)->first();
        abort_unless($membership?->canAccess(Surface::Desk), 403);
        if ($room) {
            abort_unless($room->organization_id === Organization::currentId() && $room->participants()->where('user_id', $user->id)->exists(), 404);
        }
    }

    public function create(User $user, array $data): StaffChatRoom
    {
        return DB::transaction(function () use ($user, $data) {
            Organization::whereKey(Organization::currentId())->lockForUpdate()->firstOrFail();
            $this->authorize($user);
            $ids = array_values(array_unique([...array_map('intval', $data['member_ids']), $user->id]));
            $allowed = $this->team()->pluck('id')->all();
            if (array_diff($ids, $allowed) || ($data['kind'] === 'direct' && count($ids) !== 2)) {
                throw ValidationException::withMessages(['member_ids' => 'Choose current Desk team members. A direct message needs one other person.']);
            }
            sort($ids);
            $directKey = $data['kind'] === 'direct' ? implode(':', $ids) : null;
            if ($directKey && ($existing = StaffChatRoom::where('direct_key', $directKey)->first())) {
                return $existing;
            }
            $room = StaffChatRoom::create(['kind' => $data['kind'], 'name' => $data['kind'] === 'channel' ? trim($data['name']) : null, 'direct_key' => $directKey, 'created_by' => $user->id]);
            foreach ($ids as $id) {
                $room->participants()->create(['user_id' => $id]);
            }
            Activity::log($room, 'staff_chat.created', 'Staff conversation created', $user, ['kind' => $room->kind, 'member_ids' => $ids]);

            return $room;
        });
    }

    public function send(User $user, StaffChatRoom $room, array $data): StaffChatMessage
    {
        return DB::transaction(function () use ($user, $room, $data) {
            $room = StaffChatRoom::whereKey($room->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $room);
            $body = trim($data['body']);
            if ($body === '') {
                throw ValidationException::withMessages(['body' => 'Write a message before sending.']);
            }
            $existing = $room->messages()->where('user_id', $user->id)->where('client_id', $data['client_id'])->first();
            if ($existing) {
                if ($existing->body !== $body) {
                    throw ValidationException::withMessages(['client_id' => 'This send reference was already used for a different message.']);
                }

                return $existing;
            }
            $message = $room->messages()->create(['user_id' => $user->id, 'body' => $body, 'client_id' => $data['client_id']]);
            $room->touch();

            return $message;
        });
    }

    public function record(StaffChatMessage $message): array
    {
        return ['id' => $message->id, 'body' => $message->body, 'created_at' => $message->created_at->toIso8601String(), 'author' => ['id' => $message->user_id, 'name' => $message->user?->name ?? 'Former team member']];
    }

    public function rooms(User $user): Collection
    {
        $this->authorize($user);

        return StaffChatRoom::whereHas('participants', fn ($q) => $q->where('user_id', $user->id))->with('participants.user:id,name', 'latestMessage.user:id,name')
            ->withCount(['messages as unread_count' => fn ($q) => $q->where(fn ($authors) => $authors->whereNull('user_id')->orWhere('user_id', '!=', $user->id))->whereRaw('staff_chat_messages.id > COALESCE((SELECT last_read_message_id FROM staff_chat_participants WHERE staff_chat_participants.staff_chat_room_id = staff_chat_rooms.id AND staff_chat_participants.user_id = ?), 0)', [$user->id])])
            ->orderByDesc('updated_at')->orderByDesc('id')->get()->map(fn ($room) => [
                'id' => $room->id, 'kind' => $room->kind, 'name' => $room->kind === 'direct' ? ($room->participants->firstWhere('user_id', '!=', $user->id)?->user?->name ?? 'Former team member') : $room->name,
                'unread_count' => $room->unread_count, 'members' => $room->participants->map(fn ($p) => ['id' => $p->user_id, 'name' => $p->user?->name ?? 'Former team member'])->values(),
                'latest_message' => $room->latestMessage ? $this->record($room->latestMessage) : null]);
    }
}
