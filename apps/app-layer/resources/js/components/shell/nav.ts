import {
    AudioLines,
    Bell,
    CalendarDays,
    Blocks,
    BookOpenText,
    Bot,
    Brain,
    Code2,
    FlaskConical,
    Inbox,
    MessageCircle,
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
    /** The page exists but what it configures does not work yet: the sidebar tags it "Coming soon". */
    soon?: boolean;
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
                { label: 'Talk', href: '/studio/talk', icon: AudioLines, keywords: 'voice mode call live chat test customer' },
                { label: 'Identity', href: '/studio/agent', icon: UserRound, keywords: 'persona greeting language models' },
                { label: 'Core runtime', href: '/studio/runtime', icon: Workflow, keywords: 'taker worker prompts models action permissions' },
                { label: 'Voice', href: '/studio/voice', icon: AudioLines, keywords: 'tts speech cartesia elevenlabs' },
                { label: 'Experts', href: '/studio/experts', icon: Bot, keywords: 'optional specialists private skills' },
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
                // No SIP trunk or carrier is wired: phone lines cannot reach the agent yet.
                { label: 'Telephony', href: '/studio/telephony', icon: Phone, keywords: 'numbers sip twilio livekit', soon: true },
                // EvalController sends runner_available=false and there is no route to start a run.
                { label: 'Evaluations', href: '/studio/evals', icon: FlaskConical, keywords: 'tests quality', soon: true },
                { label: 'Developer', href: '/studio/developer', icon: Code2, keywords: 'api keys webhooks' },
                { label: 'Settings', href: '/studio/settings', icon: Settings, keywords: 'team organization profile pipelines' },
            ],
        },
    ],
    desk: [
        {
            items: [
                { label: 'Clinic workspace', href: '/desk/modules', icon: Blocks, keywords: 'clinical chart notes prescriptions laboratory images documents vaccines referrals billing inventory' },
                { label: 'Dashboard', href: '/desk/dashboard', icon: LayoutDashboard, keywords: 'today overview worklist' },
                { label: 'Patients', href: '/desk/patients', icon: Users, keywords: 'healthcare registration demographics medical record' },
                { label: 'Calendar', href: '/desk/calendar', icon: CalendarDays, keywords: 'provider appointments scheduling booking slots' },
                { label: 'Providers', href: '/desk/providers', icon: UserCog, keywords: 'doctors practitioners clinic services availability' },
                { label: 'Patient inbox', href: '/desk/inbox', icon: Inbox, keywords: 'conversations messages sms email' },
                { label: 'Calls', href: '/desk/calls', icon: PhoneCall, keywords: 'phone log review' },
                { label: 'Tickets', href: '/desk/tickets', icon: Ticket, keywords: 'issues support' },
            ],
        },
        {
            heading: 'Workspace',
            items: [
                { label: 'Billing', href: '/desk/billing', icon: Ticket, keywords: 'invoice payments PKR receipts' },
                { label: 'Inventory', href: '/desk/inventory', icon: Library, keywords: 'stock batches expiry dispensing' },
                { label: 'Care tasks', href: '/desk/care-tasks', icon: Workflow, keywords: 'recalls followup due assigned' },
                { label: 'Analytics', href: '/desk/analytics', icon: LayoutDashboard, keywords: 'revenue appointments reports' },
                { label: 'Practice Settings', href: '/desk/practice', icon: Settings, keywords: 'clinic templates questionnaires quick text' },
                { label: 'Team chat', href: '/desk/chat', icon: MessageCircle, keywords: 'internal staff channels direct messages' },
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
