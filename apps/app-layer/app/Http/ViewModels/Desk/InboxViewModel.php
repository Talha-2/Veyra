<?php

namespace App\Http\ViewModels\Desk;

use App\Enums\Channel;
use App\Enums\ConversationStatus;
use App\Models\Conversation;
use App\Models\SavedView;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Everything the inbox list needs, and nothing the thread pane needs.
 */
class InboxViewModel
{
    public const VIEWS = ['all', 'unassigned', 'mine', 'unread', 'favorites', 'snoozed', 'closed'];

    /** Sort keys the popover offers. Each maps to a column and a sensible default direction. */
    public const SORTS = [
        'recent' => ['last_message_at', 'desc'],
        'oldest' => ['last_message_at', 'asc'],
        'unread' => ['unread_count', 'desc'],
        'created' => ['created_at', 'desc'],
        'title' => ['contact_id', 'asc'],
    ];

    public function __construct(
        private readonly Request $request,
        private readonly User $user,
    ) {}

    public function view(): string
    {
        $view = (string) $this->request->query('view', 'all');

        return in_array($view, self::VIEWS, strict: true) ? $view : 'all';
    }

    public function sort(): string
    {
        $sort = (string) $this->request->query('sort', 'recent');

        return array_key_exists($sort, self::SORTS) ? $sort : 'recent';
    }

    public function toArray(): array
    {
        return [
            'view' => $this->view(),
            'sort' => $this->sort(),
            'filters' => [
                'search' => $this->request->query('search'),
                'channel' => $this->request->query('channel'),
                'tag' => $this->request->query('tag'),
                'saved_view' => $this->request->query('saved_view'),
            ],
            'counts' => $this->counts(),
            'channels' => collect(Channel::cases())
                ->map(fn (Channel $c) => ['value' => $c->value, 'label' => $c->label(), 'composable' => $c->isComposable()])
                ->all(),
            'sorts' => collect(self::SORTS)->keys()->map(fn ($k) => ['value' => $k, 'label' => ucfirst($k)])->all(),
            'saved_views' => SavedView::query()->visibleTo($this->user, 'inbox')->get()
                ->map(fn ($v) => ['id' => $v->id, 'name' => $v->name, 'filters' => $v->filters, 'is_shared' => $v->is_shared, 'mine' => $v->user_id === $this->user->id])
                ->all(),
            'team' => User::whereHas('memberships')->get(['id', 'name'])->all(),
            'ticket_types' => TicketType::query()->where('enabled', true)->orderBy('position')->get(['id', 'name', 'color'])->all(),
            'existing_tags' => \App\Models\Tag::query()->orderBy('name')->pluck('name')->all(),
            'conversations' => $this->conversations(),
        ];
    }

    private function counts(): array
    {
        $base = fn () => Conversation::query();

        return [
            'all' => $base()->inbox()->count(),
            'unassigned' => $base()->inbox()->unassigned()->count(),
            'mine' => $base()->inbox()->assignedTo($this->user)->count(),
            'unread' => $base()->inbox()->unread()->count(),
            'favorites' => $base()->where('is_favorite', true)->count(),
            'snoozed' => $this->snoozed($base())->count(),
            'closed' =>$base()->where('status', ConversationStatus::Closed)->count(),
        ];
    }

    private function conversations(): Collection
    {
        $query = Conversation::query()
            ->with([
                'contact:id,name,phone,email,company,is_favorite',
                'identifier:id,type,value,blocked_at',
                'assignees:id,name',
                'tags:id,name',
                'messages' => fn ($q) => $q->latest()->limit(1),
            ]);

        $this->applyView($query);
        $this->applyFilters($query);

        [$column, $direction] = self::SORTS[$this->sort()];

        return $query
            ->orderBy($column, $direction)
            ->orderByDesc('id')
            ->limit(80)
            ->get()
            ->map(fn (Conversation $c) => $this->row($c));
    }

    private function applyView(Builder $query): void
    {
        match ($this->view()) {
            'unassigned' => $query->inbox()->unassigned(),
            'mine' => $query->inbox()->assignedTo($this->user),
            'unread' => $query->inbox()->unread(),
            'favorites' => $query->where('is_favorite', true),
            'snoozed' => $this->snoozed($query),
            'closed' => $query->where('status', ConversationStatus::Closed),
            default => $query->inbox(),
        };
    }

    /** Snoozed and still asleep: the complement of what the inbox scope wakes. */
    private function snoozed(Builder $query): Builder
    {
        return $query
            ->where('status', ConversationStatus::Snoozed)
            ->where('snoozed_until', '>', now());
    }

    private function applyFilters(Builder $query): void
    {
        // A saved view is just a stored filter set; it is applied first and the
        // URL's own filters layer over it.
        if ($id = $this->request->query('saved_view')) {
            $saved = SavedView::query()->visibleTo($this->user, 'inbox')->find($id);
            foreach ($saved?->filters ?? [] as $key => $value) {
                if ($value !== null && $value !== '' && ! $this->request->has($key)) {
                    $this->request->merge([$key => $value]);
                }
            }
        }

        if ($channel = $this->request->query('channel')) {
            $query->where('channel', $channel);
        }

        if ($tag = $this->request->query('tag')) {
            $query->whereHas('tags', fn ($t) => $t->where('name', $tag));
        }

        if ($search = trim((string) $this->request->query('search'))) {
            $query->where(function (Builder $q) use ($search) {
                $q->whereHas('contact', fn ($c) => $c
                    ->where('name', 'ilike', "%{$search}%")
                    ->orWhere('phone', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%"))
                    ->orWhereHas('identifier', fn ($i) => $i->where('value', 'ilike', "%{$search}%"))
                    ->orWhereHas('messages', fn ($m) => $m->where('body', 'ilike', "%{$search}%"));
            });
        }
    }

    private function row(Conversation $conversation): array
    {
        $latest = $conversation->messages->first();

        return [
            'id' => $conversation->id,
            'title' => $conversation->title(),
            'channel' => $conversation->channel->value,
            'status' => $conversation->status->value,
            'snoozed_until' => $conversation->snoozed_until?->toIso8601String(),
            'is_favorite' => $conversation->is_favorite,
            'unread_count' => $conversation->unread_count,
            'last_message_at' => $conversation->last_message_at?->toIso8601String(),
            'preview' => $latest ? str($latest->body ?? '')->limit(120)->value() : null,
            'last_from_agent' => (bool) $latest?->from_agent,
            'last_direction' => $latest?->direction,
            'blocked' => (bool) $conversation->identifier?->isBlocked(),
            'tags' => $conversation->tags->pluck('name')->all(),
            'contact' => $conversation->contact ? [
                'id' => $conversation->contact->id,
                'name' => $conversation->contact->displayName(),
                'initials' => $conversation->contact->initials(),
                'company' => $conversation->contact->company,
                'is_favorite' => $conversation->contact->is_favorite,
            ] : null,
            'identifier' => $conversation->contact ? null : $conversation->identifier?->value,
            'assignees' => $conversation->assignees->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->all(),
        ];
    }
}
