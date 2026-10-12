<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\Surface;
use App\Models\Organization;
use App\Models\StaffChatMessage;
use App\Models\User;
use Tests\HealthcareTestCase;

class StaffChatTest extends HealthcareTestCase
{
    private function colleague(string $name = 'Reception'): User
    {
        $user = User::factory()->create(['name' => $name]);
        $this->clinic->addMember($user, OrganizationRole::Member);

        return $user;
    }

    private function channel(User $colleague): int
    {
        return $this->postJson('/desk/chat/rooms', ['kind' => 'channel', 'name' => 'Clinic handover', 'member_ids' => [$colleague->id]])
            ->assertCreated()->json('room_id');
    }

    public function test_channels_persist_messages_with_author_and_are_visible_to_participants(): void
    {
        $colleague = $this->colleague();
        $id = $this->channel($colleague);
        $this->postJson("/desk/chat/rooms/$id/messages", ['body' => 'Morning handover', 'client_id' => 'message-1'])->assertCreated();
        $this->actingAs($colleague)->getJson("/desk/chat/rooms/$id/feed")->assertOk()->assertJsonPath('messages.0.body', 'Morning handover')->assertJsonPath('messages.0.author.name', 'Clinic Owner');
        $this->getJson('/desk/chat/rooms')->assertJsonPath('rooms.0.unread_count', 1);
    }

    public function test_direct_messages_reuse_the_same_room_in_both_directions(): void
    {
        $colleague = $this->colleague();
        $id = $this->postJson('/desk/chat/rooms', ['kind' => 'direct', 'member_ids' => [$colleague->id]])->assertCreated()->json('room_id');
        $this->actingAs($colleague)->postJson('/desk/chat/rooms', ['kind' => 'direct', 'member_ids' => [$this->owner->id]])->assertCreated()->assertJsonPath('room_id', $id);
    }

    public function test_nonparticipants_and_other_clinics_cannot_read_or_write_channels(): void
    {
        $id = $this->channel($this->colleague());
        $outsider = $this->colleague('Uninvited');
        $this->actingAs($outsider)->getJson("/desk/chat/rooms/$id/feed")->assertNotFound();
        $this->postJson("/desk/chat/rooms/$id/messages", ['body' => 'Hidden', 'client_id' => 'outside'])->assertNotFound();
        $this->getJson('/desk/chat/rooms')->assertJsonCount(0, 'rooms');
        $other = $this->otherClinic();
        $other->addMember($this->owner, OrganizationRole::Owner);
        Organization::setCurrent($other);
        $this->actingAs($this->owner)->getJson("/desk/chat/rooms/$id/feed")->assertNotFound();
    }

    public function test_invites_reject_outside_clinic_and_studio_only_staff(): void
    {
        $outside = User::factory()->create();
        $this->otherClinic()->addMember($outside, OrganizationRole::Member);
        $this->postJson('/desk/chat/rooms', ['kind' => 'direct', 'member_ids' => [$outside->id]])->assertUnprocessable()->assertJsonValidationErrors('member_ids');
        $colleague = $this->colleague();
        $colleague->currentMembership()->revoke(Surface::Desk);
        $this->postJson('/desk/chat/rooms', ['kind' => 'channel', 'name' => 'Handover', 'member_ids' => [$colleague->id]])->assertUnprocessable();
    }

    public function test_message_retry_does_not_duplicate_or_replace_an_existing_message(): void
    {
        $id = $this->channel($this->colleague());
        $payload = ['body' => 'Saved once', 'client_id' => 'stable-key'];
        $first = $this->postJson("/desk/chat/rooms/$id/messages", $payload)->assertCreated()->json('message.id');
        $this->postJson("/desk/chat/rooms/$id/messages", $payload)->assertCreated()->assertJsonPath('message.id', $first);
        $this->postJson("/desk/chat/rooms/$id/messages", [...$payload, 'body' => 'Changed'])->assertUnprocessable();
        $this->assertDatabaseCount('staff_chat_messages', 1);
        $this->postJson("/desk/chat/rooms/$id/messages", ['body' => '   ', 'client_id' => 'blank'])->assertUnprocessable();
    }

    public function test_read_markers_only_cover_displayed_messages_and_never_move_backwards(): void
    {
        $colleague = $this->colleague();
        $id = $this->channel($colleague);
        $one = $this->postJson("/desk/chat/rooms/$id/messages", ['body' => 'One', 'client_id' => 'one'])->json('message.id');
        $two = $this->postJson("/desk/chat/rooms/$id/messages", ['body' => 'Two', 'client_id' => 'two'])->json('message.id');
        $this->actingAs($colleague)->postJson("/desk/chat/rooms/$id/read", ['message_id' => $one])->assertOk();
        $this->getJson('/desk/chat/rooms')->assertJsonPath('rooms.0.unread_count', 1);
        $this->postJson("/desk/chat/rooms/$id/read", ['message_id' => $two])->assertOk();
        $this->postJson("/desk/chat/rooms/$id/read", ['message_id' => $one])->assertOk();
        $this->getJson('/desk/chat/rooms')->assertJsonPath('rooms.0.unread_count', 0);
        $otherId = $this->channel($colleague);
        $this->postJson("/desk/chat/rooms/$otherId/read", ['message_id' => $two])->assertUnprocessable();
    }

    public function test_history_uses_bounded_pages_without_losing_older_messages(): void
    {
        $id = $this->channel($this->colleague());
        for ($i = 0; $i < 105; $i++) {
            StaffChatMessage::create(['staff_chat_room_id' => $id, 'user_id' => $this->owner->id, 'body' => "Message $i", 'client_id' => "key-$i"]);
        }
        $data = $this->getJson("/desk/chat/rooms/$id/feed")->assertOk()->assertJsonCount(100, 'messages')->assertJsonPath('has_older', true)->json();
        $this->getJson("/desk/chat/rooms/$id/feed?before=".$data['messages'][0]['id'])->assertJsonCount(5, 'messages')->assertJsonPath('has_older', false);
    }

    public function test_removed_members_lose_chat_access_even_if_still_a_participant(): void
    {
        $colleague = $this->colleague();
        $id = $this->channel($colleague);
        $colleague->memberships()->delete();
        $this->actingAs($colleague)->getJson("/desk/chat/rooms/$id/feed")->assertRedirect(route('onboarding.organization'));
    }

    public function test_account_deletion_preserves_chat_history_without_blocking_existing_account_flow(): void
    {
        $colleague = $this->colleague();
        $id = $this->channel($colleague);
        $this->actingAs($colleague)->postJson("/desk/chat/rooms/$id/messages", ['body' => 'Saved handover', 'client_id' => 'history']);
        $this->actingAs($this->owner);
        $colleague->delete();
        $this->getJson('/desk/chat/rooms')->assertJsonPath('rooms.0.unread_count', 1);
        $messageId = $this->getJson("/desk/chat/rooms/$id/feed")->assertOk()->assertJsonPath('messages.0.body', 'Saved handover')->assertJsonPath('messages.0.author.name', 'Former team member')->json('messages.0.id');
        $this->postJson("/desk/chat/rooms/$id/read", ['message_id' => $messageId])->assertOk();
        $this->getJson('/desk/chat/rooms')->assertJsonPath('rooms.0.unread_count', 0);
    }
}
