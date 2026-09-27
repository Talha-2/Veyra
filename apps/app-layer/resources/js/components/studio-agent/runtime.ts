import { Bot, MessageSquareText, Mic, Wrench, type LucideIcon } from 'lucide-react';

import type { Tone } from '../ui/primitives';

/** How each expert runtime is drawn, and what its empty group should say. */
export const RUNTIME_LOOK: Record<string, { icon: LucideIcon; tone: Tone; empty: string }> = {
    talker: { icon: Mic, tone: 'accent', empty: 'No talker. Every call needs one to speak to the caller.' },
    worker: { icon: Wrench, tone: 'info', empty: 'No worker. Without one the talker cannot run skills or take actions.' },
    text: { icon: MessageSquareText, tone: 'muted', empty: 'No text expert yet. Add one to answer chat, SMS and email in their own register.' },
};

export const runtimeLook = (runtime: string) => RUNTIME_LOOK[runtime] ?? { icon: Bot, tone: 'muted' as Tone, empty: 'None yet.' };
