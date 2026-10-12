import { Link, usePage } from '@inertiajs/react';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
export function ClinicalPatientNav({ id }: { id: number }) {
    const { url } = usePage();
    const more = useRef<HTMLDetailsElement>(null);
    useEffect(() => { if (more.current) more.current.open = false; }, [url]);
    const primary = [['Visits', `/desk/patients/${id}/chart`], ['Problems & allergies', `/desk/patients/${id}/care`], ['Prescriptions', `/desk/prescriptions?patient_id=${id}`], ['Labs', `/desk/labs?patient_id=${id}`], ['Imaging', `/desk/images?patient_id=${id}`]];
    const secondary = [['Documents', `/desk/documents?patient_id=${id}`], ['Injections & vaccines', `/desk/injections?patient_id=${id}`], ['Referrals', `/desk/referrals?patient_id=${id}`], ['Vitals', `/desk/flowsheets?patient_id=${id}`], ['Questionnaires', `/desk/patients/${id}/questionnaires`], ['Portal access', `/desk/patients/${id}/portal`], ['Billing', `/desk/billing?patient_id=${id}`], ['Care tasks', `/desk/care-tasks?patient_id=${id}`]];
    const active = (href: string) => url.split('?')[0] === href.split('?')[0] || url.split('?')[0].startsWith(href.split('?')[0] + '/');
    const secondaryActive = secondary.find(([, href]) => active(href));
    const item = ([label, href]: string[]) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={'v-btn whitespace-nowrap ' + (active(href) ? 'v-btn--secondary font-semibold' : 'v-btn--ghost')}>{label}</Link>;
    return <nav aria-label="Patient clinical modules" className="mb-8 flex flex-wrap items-center gap-2 border-b border-border pb-5">{primary.map(item)}<details ref={more} className="relative w-full sm:w-auto" onKeyDown={event => { if (event.key === 'Escape' && more.current) { more.current.open = false; more.current.querySelector('summary')?.focus(); } }}><summary className={'v-btn cursor-pointer list-none ' + (secondaryActive ? 'v-btn--secondary font-semibold' : 'v-btn--ghost')}>{secondaryActive ? secondaryActive[0] : 'More'}<ChevronDown size={16} /></summary><div className="right-0 z-20 mt-2 grid sm:absolute sm:min-w-60 gap-1 rounded-xl border border-border bg-surface p-3" aria-label="More patient modules">{secondary.map(item)}</div></details></nav>;
}
