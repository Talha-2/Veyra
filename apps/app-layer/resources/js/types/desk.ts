/** Mirrors InboxViewModel and ThreadViewModel. Keep in step with those. */

import type { Tone } from '../components/ui/primitives';

export interface TeamMember { id: number; name: string }

export interface ConversationRow {
    id: number;
    title: string;
    channel: string;
    status: string;
    is_favorite: boolean;
    unread_count: number;
    last_message_at: string | null;
    preview: string | null;
    last_from_agent: boolean;
    last_direction: string | null;
    blocked: boolean;
    tags: string[];
    contact: { id: number; name: string; initials: string; company: string | null; is_favorite: boolean } | null;
    identifier: string | null;
    assignees: TeamMember[];
}

export interface ToolCallView {
    id: number; action: string; slug: string; status: string; status_label: string; tone: Tone;
    duration_ms: number | null; error: string | null; durable: boolean; needs_reconciliation: boolean;
}

export interface DelegationView {
    sequence: number; status: string; failed: boolean; is_finalization: boolean;
    duration_ms: number | null; reply: string | null; error: string | null; tool_calls: ToolCallView[];
}

export interface TimelineMessage {
    kind: 'message';
    id: number; at: string; direction: string; from_agent: boolean; author: string;
    body: string | null; status: string; pinned: boolean;
    my_feedback: 'up' | 'down' | null; feedback_counts: { up: number; down: number };
    attachments: { id: number; filename: string; size_bytes: number }[];
}

export interface TimelineCall {
    kind: 'call';
    id: number; at: string; direction: string; status: string; duration: string;
    language: string | null; recording_url: string | null;
    transcript: { role: string; text: string }[] | null; p95_ms: number | null; work: DelegationView[];
}

export type TimelineEntry = TimelineMessage | TimelineCall;

export interface TicketSummary {
    id: number; reference: string; subject: string; status: string; status_label?: string; status_tone?: Tone;
    priority: string; priority_tone: Tone; created_by_agent: boolean;
}

export interface ThreadView {
    id: number;
    title: string;
    channel: string;
    channel_label: string;
    can_compose: boolean;
    status: string;
    is_favorite: boolean;
    subject: string | null;
    tags: string[];
    identifier: { id: number; value: string; type: string; blocked: boolean; dnd: boolean; dnd_until: string | null } | null;
    assignees: TeamMember[];
    contact: {
        id: number; name: string; initials: string; phone: string | null; email: string | null; company: string | null;
        is_favorite: boolean; stage: string; stage_label: string; stage_tone: Tone;
        tags: { name: string; color: string }[]; open_tickets: TicketSummary[];
    } | null;
    timeline: TimelineEntry[];
    pinned: { id: number; body: string; at: string }[];
    details: {
        notes: { id: number; body: string; author: string; at: string }[];
        reminders: { id: number; text: string; due_at: string | null; overdue: boolean }[];
        tickets: TicketSummary[];
        activities: { id: number; actor: string; is_agent: boolean; type: string; description: string; at: string }[];
        attachments: { id: number; filename: string; size_bytes: number; mime: string | null }[];
    };
}

export interface SavedViewRow { id: number; name: string; filters: Record<string, string | null>; is_shared: boolean; mine: boolean }

export interface InboxProps {
    view: string;
    sort: string;
    filters: { search: string | null; channel: string | null; tag: string | null; saved_view: string | null };
    counts: Record<string, number>;
    channels: { value: string; label: string; composable: boolean }[];
    sorts: { value: string; label: string }[];
    saved_views: SavedViewRow[];
    team: TeamMember[];
    ticket_types: { id: number; name: string; color: string }[];
    existing_tags: string[];
    conversations: ConversationRow[];
    thread: ThreadView | null;
}
