import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

/** Free-form tags with suggestions. Enter or comma adds; backspace on empty removes the last. */
export default function TagInput({
    value,
    onChange,
    suggestions = [],
    placeholder = 'Add tag…',
}: {
    value: string[];
    onChange: (tags: string[]) => void;
    suggestions?: string[];
    placeholder?: string;
}) {
    const [draft, setDraft] = useState('');

    const add = (raw: string) => {
        const tag = raw.trim().toLowerCase();
        if (tag && !value.includes(tag)) onChange([...value, tag]);
        setDraft('');
    };

    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
        } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
        }
    };

    const matches = draft ? suggestions.filter((s) => s.includes(draft.toLowerCase()) && !value.includes(s)).slice(0, 5) : [];

    return (
        <div className="relative">
            <div className="v-field flex h-auto min-h-[36px] flex-wrap items-center gap-1 py-1">
                {value.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[11.5px]"
                        style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)' }}>
                        {tag}
                        <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}>
                            <X size={10} strokeWidth={2.5} />
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKey}
                    onBlur={() => draft && add(draft)}
                    placeholder={value.length ? '' : placeholder}
                    className="min-w-[80px] flex-1 bg-transparent text-[13px] outline-none"
                    style={{ color: 'var(--text-primary)' }}
                />
            </div>
            {matches.length > 0 && (
                <div className="v-panel absolute top-full left-0 z-20 mt-1 w-full overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
                    {matches.map((s) => (
                        <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); add(s); }}
                            className="block w-full px-3 py-1.5 text-left text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
