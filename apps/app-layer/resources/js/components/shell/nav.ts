import {
    AudioLines,
    Bell,
    Blocks,
    BookOpenText,
    Bot,
    Brain,
    Code2,
    FlaskConical,
    Inbox,
    KanbanSquare,
    LayoutDashboard,
    Library,
    Phone,
    PhoneCall,
    Settings,
    Sparkles,
    Ticket,
    UserCog,
    UserRound,
    Users,
    Workflow,
    type LucideIcon,
} from 'lucide-react';

import type { SurfaceKey } from '../../types';

export interface ShellNavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    /** Exact match when it ends in `$`, prefix match otherwise. Defaults to href. */
    match?: string;
    keywords?: string;
}

export interface ShellNavGroup {
    heading?: string;
    items: ShellNavItem[];
}

/**
 * Each product's navigation, declared once. The sidebars render from it and
 * the command palette searches it — so a page that exists is a page you can
 * find by typing its name.
 */
export const NAV: Record<SurfaceKey, ShellNavGroup[]> = {
    studio: [
        {
            heading: 'Agent',
            items: [
                { label: 'Overview', href: '/studio', icon: LayoutDashboard, match: '/studio$', keywords: 'home health dashboard' },
                { label: 'Ask', href: '/studio/ask', icon: Sparkles, keywords: 'chat assistant claude agent' },
                { label: 'Identity', href: '/studio/agent', icon: UserRound, keywords: 'persona greeting language models' },
                { label: 'Voice', href: '/studio/voice', icon: AudioLines, keywords: 'tts speech cartesia elevenlabs' },
                { label: 'Experts', href: '/studio/experts', icon: Bot, keywords: 'talker worker specialists' },
            ],
        },
        {
            heading: 'Capability',
            items: [
                { label: 'Skills', href: '/studio/skills', icon: BookOpenText, keywords: 'playbooks instructions' },
                { label: 'Automations', href: '/studio/automations', icon: Workflow, keywords: 'schedule webhook jobs' },
                { label: 'Knowledge', href: '/studio/knowledge', icon: Library, keywords: 'documents rag search' },
                { label: 'Memory', href: '/studio/memory', icon: Brain, keywords: 'remember facts' },
                { label: 'Integrations', href: '/studio/integrations', icon: Blocks, keywords: 'composio mcp actions tools apps' },
            ],
        },
        {
            heading: 'Operations',
            items: [
                { label: 'Telephony', href: '/studio/telephony', icon: Phone, keywords: 'numbers sip twilio livekit' },
                { label: 'Evaluations', href: '/studio/evals', icon: FlaskConical, keywords: 'tests quality' },
                { label: 'Developer', href: '/studio/developer', icon: Code2, keywords: 'api keys webhooks' },
                { label: 'Settings', href: '/studio/settings', icon: Settings, keywords: 'team organization profile pipelines' },
            ],
        },
    ],
    desk: [
        {
            items: [
                { label: 'Dashboard', href: '/desk/dashboard', icon: LayoutDashboard, keywords: 'home overview' },
                { label: 'Inbox', href: '/desk/inbox', icon: Inbox, keywords: 'conversations messages sms email' },
                { label: 'Calls', href: '/desk/calls', icon: PhoneCall, keywords: 'phone log review' },
                { label: 'Contacts', href: '/desk/contacts', icon: Users, keywords: 'customers people' },
                { label: 'Leads', href: '/desk/leads', icon: KanbanSquare, keywords: 'pipeline deals' },
                { label: 'Tickets', href: '/desk/tickets', icon: Ticket, keywords: 'issues support' },
            ],
        },
        {
            heading: 'Workspace',
            items: [
                { label: 'Team', href: '/desk/team', icon: UserCog, keywords: 'people workload' },
                { label: 'Notifications', href: '/desk/notifications', icon: Bell, keywords: 'alerts' },
            ],
        },
    ],
};

export function isActive(item: ShellNavItem, url: string): boolean {
    const path = url.split('?')[0];
    const match = item.match ?? item.href;
    if (match.endsWith('$')) return path === match.slice(0, -1);
    return path === match || path.startsWith(`${match}/`);
}
