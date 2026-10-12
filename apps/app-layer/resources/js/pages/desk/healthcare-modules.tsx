import { Head, Link } from '@inertiajs/react';
import { Activity, ArrowUpRight, CalendarDays, ChartNoAxesCombined, ClipboardCheck, ClipboardList, Files, FlaskConical, LayoutDashboard, MessageCircle, Package, Pill, ScanLine, Send, Settings, Stethoscope, Syringe, Users, Wallet, type LucideIcon } from 'lucide-react';
import { DeskPage } from '../../components/desk-pages/layout';
import { PageHeader } from '../../components/ui/page';

interface Module { name: string; href: string; description: string; icon: LucideIcon }
interface Props {
    can_access_clinical: boolean;
    organization: { name: string };
    clinic_date: string;
    timezone: string;
    counts: { patients: number; providers: number; appointments_today: number; open_tasks: number; overdue_tasks: number };
}
const primary: Module[] = [
    { name: 'Dashboard', href: '/desk/dashboard', description: 'Clinic activity and operational overview', icon: LayoutDashboard },
    { name: 'Calendar', href: '/desk/calendar', description: 'Provider schedules and checked free slots', icon: CalendarDays },
    { name: 'Patients', href: '/desk/patients', description: 'Registration and patient records', icon: Users },
    { name: 'Providers', href: '/desk/providers', description: 'Care team, locations and services', icon: Stethoscope },
];
const clinical: Module[] = [
    { name: 'Chart notes', href: '/desk/chart-notes', description: 'Consultations, signed notes and amendments', icon: ClipboardList },
    { name: 'Prescriptions', href: '/desk/prescriptions', description: 'Provider-reviewed prescriptions and printouts', icon: Pill },
    { name: 'Laboratory', href: '/desk/labs', description: 'Test orders, results and review', icon: FlaskConical },
    { name: 'Imaging', href: '/desk/images', description: 'Imaging orders and reports', icon: ScanLine },
    { name: 'Documents', href: '/desk/documents', description: 'Private patient files and downloads', icon: Files },
    { name: 'Injections & vaccines', href: '/desk/injections', description: 'Administrations, batches and next due dates', icon: Syringe },
    { name: 'Referrals', href: '/desk/referrals', description: 'Referral letters and issue history', icon: Send },
    { name: 'Vitals flowsheets', href: '/desk/flowsheets', description: 'Longitudinal vital signs by patient', icon: Activity },
];
const operations: Module[] = [
    { name: 'Patient inbox', href: '/desk/inbox', description: 'Patient conversations and follow-ups', icon: MessageCircle },
    { name: 'Care tasks & recalls', href: '/desk/care-tasks', description: 'Assigned work and patient follow-up dates', icon: ClipboardCheck },
    { name: 'Billing', href: '/desk/billing', description: 'PKR invoices, payments and receipts', icon: Wallet },
    { name: 'Inventory', href: '/desk/inventory', description: 'Batches, expiry and dispensing ledger', icon: Package },
    { name: 'Analytics', href: '/desk/analytics', description: 'Appointments, revenue and operational reports', icon: ChartNoAxesCombined },
    { name: 'Team chat', href: '/desk/chat', description: 'Private channels and direct messages', icon: MessageCircle },
    { name: 'Practice settings', href: '/desk/practice', description: 'Practice details, templates and questionnaires', icon: Settings },
];
function ModuleLink({ module, prominent = false }: { module: Module; prominent?: boolean }) {
    const Icon = module.icon;
    return <Link href={module.href} className={'group block min-w-0 rounded-xl px-4 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ' + (prominent ? 'border border-border bg-surface hover:bg-surface-hover' : 'hover:bg-surface-hover')}>
        <div className="flex items-center gap-3"><span className={'flex size-8 shrink-0 items-center justify-center rounded-lg ' + (prominent ? 'bg-accent-subtle text-accent-text' : 'bg-surface-sunken text-secondary group-hover:text-primary')}><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span><h3 className="min-w-0 flex-1 text-base font-semibold text-primary group-hover:underline">{module.name}</h3><ArrowUpRight size={15} className="shrink-0 text-tertiary group-hover:text-primary" aria-hidden="true" /></div>
        <p className="mt-2 text-sm leading-relaxed text-secondary">{module.description}</p>
    </Link>;
}
function Modules({ title, items }: { title: string; items: Module[] }) {
    return <section className="min-w-0"><h2 className="border-b border-border pb-4 text-lg font-semibold">{title}</h2><nav aria-label={title} className="mt-3 grid items-start gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">{items.map(module => <ModuleLink key={module.href} module={module} />)}</nav></section>;
}
export default function HealthcareModules({ can_access_clinical, organization, clinic_date, timezone, counts }: Props) {
    const day = new Date(clinic_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return <><Head title="Clinic workspace" /><DeskPage width="wide" header={<PageHeader title={'Welcome to ' + organization.name} description="Choose a workspace for patient care, your clinic day or practice operations." meta={<span className="text-sm text-secondary">{day} · {timezone}</span>} />}>
        <section className="border-y border-border py-5" aria-label="Clinic overview">
            <dl className="grid items-start gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-sm text-secondary">Appointments on this clinic day</dt><dd className="mt-2 text-base font-semibold tabular-nums">{counts.appointments_today.toLocaleString()}</dd></div>
                <div><dt className="text-sm text-secondary">Open care tasks</dt><dd className="mt-2 text-base font-semibold tabular-nums">{counts.open_tasks.toLocaleString()}<span className={'ml-2 text-sm font-normal ' + (counts.overdue_tasks ? 'text-danger' : 'text-secondary')}>· {counts.overdue_tasks.toLocaleString()} overdue</span></dd></div>
                <div><dt className="text-sm text-secondary">Patient records</dt><dd className="mt-2 text-base font-semibold tabular-nums">{counts.patients.toLocaleString()}</dd></div>
                <div><dt className="text-sm text-secondary">Providers</dt><dd className="mt-2 text-base font-semibold tabular-nums">{counts.providers.toLocaleString()}</dd></div>
            </dl>
        </section>
        <nav aria-label="Main clinic workspaces" className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">{primary.map(module => <ModuleLink key={module.href} module={module} prominent />)}</nav>
        {can_access_clinical ? <Modules title="Clinical tools" items={clinical} /> : <section className="border-t border-border pt-5"><h2 className="text-lg font-semibold">Clinical tools</h2><p className="mt-2 text-sm text-secondary">Clinical tools are available to accounts linked to one active provider in this clinic.</p></section>}
        <Modules title="Practice operations" items={operations} />
    </DeskPage></>;
}
