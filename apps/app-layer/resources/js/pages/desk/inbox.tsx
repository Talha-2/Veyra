import { Head } from '@inertiajs/react';
import { useEffect, useState, type ReactNode } from 'react';

import ConversationList from '../../components/desk/conversation-list';
import ContactPanel from '../../components/desk/contact-panel';
import NewConversationDialog from '../../components/desk/new-conversation-dialog';
import Thread from '../../components/desk/thread';
import ViewRail from '../../components/desk/view-rail';
import DeskLayout from '../../layouts/desk-layout';
import type { InboxProps } from '../../types/desk';

const VIEW_TITLES: Record<string, string> = {
    all: 'Inbox',
    mine: 'Assigned to me',
    unassigned: 'Unassigned',
    unread: 'Unread',
    favorites: 'Starred',
    snoozed: 'Snoozed',
    closed: 'Closed',
};

/** A pane's open/closed state, remembered per browser — the one thing localStorage is right for here. */
function usePane(key: string): [boolean, () => void] {
    const [open, setOpen] = useState(true);

    useEffect(() => {
        try { setOpen(localStorage.getItem(key) !== 'closed'); } catch { /* private mode */ }
    }, [key]);

    const toggle = () => {
        setOpen((v) => {
            try { localStorage.setItem(key, v ? 'closed' : 'open'); } catch { /* ignore */ }
            return !v;
        });
    };

    return [open, toggle];
}

/**
 * The inbox, laid out like Mail: mailboxes, the list, the conversation, and
 * an inspector for who it is with.
 *
 * Each pane is its own scroll container and the page itself never scrolls.
 * The mailbox rail and the inspector can both be folded away.
 */
export default function Inbox(props: InboxProps) {
    const { view, sort, sorts, counts, conversations, thread, filters, channels, saved_views, team, ticket_types, existing_tags } = props;
    const [creating, setCreating] = useState(false);
    const [railOpen, toggleRail] = usePane('desk:inbox:rail');
    const [detailsOpen, toggleDetails] = usePane('desk:inbox:details');

    const saved = filters.saved_view ? saved_views.find((v) => String(v.id) === filters.saved_view) : undefined;
    const title = saved?.name ?? VIEW_TITLES[view] ?? 'Inbox';
    const state = { view, sort, filters };

    return (
        <>
            <Head title={thread ? `${thread.title} · Inbox` : title} />
            <div className="flex h-full min-h-0">
                {railOpen && (
                    <ViewRail current={view} counts={counts} savedViews={saved_views} currentSavedView={filters.saved_view}
                        currentFilters={{ search: filters.search, channel: filters.channel, tag: filters.tag }}
                        state={state} channels={channels} onNew={() => setCreating(true)} />
                )}
                <ConversationList conversations={conversations} selectedId={thread?.id ?? null} view={view} sort={sort} sorts={sorts} channels={channels}
                    filters={filters} team={team} onNew={() => setCreating(true)} title={title} railOpen={railOpen} onToggleRail={toggleRail} />
                <Thread thread={thread} team={team} ticketTypes={ticket_types} detailsOpen={detailsOpen} onToggleDetails={toggleDetails} existingTags={existing_tags} />
                {detailsOpen && <ContactPanel thread={thread} existingTags={existing_tags} />}
            </div>
            <NewConversationDialog open={creating} onClose={() => setCreating(false)} channels={channels} />
        </>
    );
}

Inbox.layout = (page: ReactNode) => <DeskLayout rail>{page}</DeskLayout>;
