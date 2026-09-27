import { Check } from 'lucide-react';

/** Multi-select over the team, as a compact checklist rather than a combobox. */
export default function AssigneePicker({
    team,
    value,
    onChange,
}: {
    team: { id: number; name: string }[];
    value: number[];
    onChange: (ids: number[]) => void;
}) {
    const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

    return (
        <div className="v-panel max-h-[220px] overflow-y-auto" style={{ background: 'var(--surface)' }}>
            {team.length === 0 && <p className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--text-tertiary)' }}>No one on the team yet.</p>}
            {team.map((u) => {
                const on = value.includes(u.id);
                return (
                    <button key={u.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(u.id)}
                        className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-[13px] last:border-b-0"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: on ? 'var(--accent-subtle)' : 'transparent' }}>
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border"
                            style={{ borderColor: on ? 'var(--accent)' : 'var(--border-strong)', background: on ? 'var(--accent)' : 'transparent' }}>
                            {on && <Check size={10} strokeWidth={3} style={{ color: 'var(--text-on-accent)' }} />}
                        </span>
                        {u.name}
                    </button>
                );
            })}
        </div>
    );
}
