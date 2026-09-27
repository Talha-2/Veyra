import { Head } from '@inertiajs/react';
import type { ReactNode } from 'react';

import { VeyraMark } from '../components/shell/sidebar';

/**
 * The shell for everything that happens before a product surface: sign in,
 * register, create your first organization.
 *
 * It is where a visitor arrives from the company website's "Get started", so
 * it carries the site's look: a black brand panel with the voice orb on wide
 * screens, and a calm, roomy form beside it. Belongs to neither Desk nor
 * Studio, which is why it is a third layout rather than a variant of either.
 */
export default function AuthLayout({
    title,
    lead,
    children,
}: {
    title: string;
    lead: string;
    children: ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-bg">
            <Head title={title} />

            <aside className="relative hidden w-[46%] max-w-[720px] flex-col justify-between overflow-hidden bg-black p-12 text-white lg:flex">
                <a href="/" className="relative z-10 inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-white">
                    <VeyraMark size={30} /> Veyra
                </a>
                <Orb />
                <div className="relative z-10">
                    <p className="text-4xl font-semibold leading-tight tracking-tight">Every call answered.<br />Every job booked.</p>
                    <p className="mt-4 max-w-[36ch] text-md text-white/60">An AI agent on your phone, texts and email, that does the work in your tools and brings your team in when it matters.</p>
                </div>
            </aside>

            <main className="flex flex-1 items-center justify-center px-6 py-12">
                <div className="w-full max-w-[400px] animate-rise">
                    <div className="mb-10 lg:hidden"><VeyraMark size={40} /></div>
                    <h1 className="text-3xl font-semibold tracking-tight text-primary">{title}</h1>
                    <p className="mt-2 mb-8 text-md text-secondary">{lead}</p>
                    {children}
                </div>
            </main>
        </div>
    );
}

/** The site's voice orb, drawn in CSS so it is sharp at any size. */
function Orb() {
    return (
        <div className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[118%] -translate-x-1/2 -translate-y-[58%]" aria-hidden="true">
            <div className="absolute inset-[-10%]" style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(233,107,52,0.4), rgba(255,95,126,0.16) 45%, transparent 70%)', filter: 'blur(24px)' }} />
            <div className="absolute inset-[22%] rounded-full" style={{
                background:
                    'radial-gradient(38% 34% at 34% 28%, rgba(255,255,255,0.9), rgba(255,255,255,0) 60%),' +
                    'radial-gradient(70% 70% at 70% 78%, rgba(139,108,255,0.85), rgba(139,108,255,0) 62%),' +
                    'radial-gradient(80% 80% at 28% 70%, rgba(255,95,126,0.9), rgba(255,95,126,0) 60%),' +
                    'radial-gradient(100% 100% at 50% 40%, #ff9a62 0%, #e96b34 38%, #b33b1c 78%, #5a1a0c 100%)',
                boxShadow: 'inset 0 -30px 60px rgba(40,8,30,0.45), 0 40px 120px -20px rgba(233,107,52,0.55)',
            }} />
            <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full opacity-60" style={{ animation: 'spin 80s linear infinite' }}>
                <circle cx="200" cy="200" r="150" fill="none" stroke="#ffb08a" strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="2 6" />
                <circle cx="200" cy="200" r="138" fill="none" stroke="#e96b34" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="40 14 4 14" />
            </svg>
        </div>
    );
}

/** A field with its label and error, so no form has to lay that out again. */
export function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div className="mb-5 [&_.v-field]:h-11 [&_.v-field]:text-md">
            <label className="v-label">{label}</label>
            {children}
            {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
    );
}
