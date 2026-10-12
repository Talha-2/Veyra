import { Bot, MessageSquareText, Mic, Wrench, type LucideIcon } from 'lucide-react';

import type { Tone } from '../ui/primitives';

/** How each expert runtime is drawn, and what its empty group should say. */
export const RUNTIME_LOOK: Record<string, { icon: LucideIcon; tone: Tone; empty: string }> = {
    talker: { icon: Mic, tone: 'accent', empty: 'No preserved conversation profiles.' },
    worker: { icon: Wrench, tone: 'info', empty: 'No worker specialists. The core worker handles shared skills.' },
    text: { icon: MessageSquareText, tone: 'muted', empty: 'No text specialists. The core runtime handles written conversations.' },
};

export const runtimeLook = (runtime: string) => RUNTIME_LOOK[runtime] ?? { icon: Bot, tone: 'muted' as Tone, empty: 'None yet.' };
