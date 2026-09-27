import { Check, Plus, Tag as TagIcon } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

/**
 * Tags as a checklist, the way Finder applies tags: type to filter, Enter to
 * create, click to toggle. No floating suggestion box, so it works inside a
 * menu or a popover without being clipped.
 *
 * Optimistic: the list reflects a click at once and `onChange` carries the
 * full new set to the server.
 */
export default function TagEditor({ value, suggestions, onChange, autoFocus = true }: {
    value: string[];
    suggestions: string[];
    onChange: (tags: string[]) => void;
    autoFocus?: boolean;
}) {
    const [tags, setTags] = useState(value);
    const [draft, setDraft] = useState('');

    useEffect(() => { setTags(value); }, [value.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

    const commit = (next: string[]) => { setTags(next); onChange(next); };
    const toggle = (tag: string) => commit(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);

    const needle = draft.trim().toLowerCase();
    const all = [...new Set([...tags, ...suggestions])];
    const shown = needle ? all.filter((t) => t.includes(needle)) : all;
    const canCreate = needle.length > 0 && !all.includes(needle);

    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!needle) return;
        if (!tags.includes(needle)) commit([...tags, needle]);
        setDraft('');
    };

    return (
        <div>
            <div className="relative mb-1">
                <TagIcon size={14} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tertiary" />
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus}
                    placeholder="Find or create a tag" aria-label="Find or create a tag"
                    className="v-field h-8 pl-8 text-sm" />
            </div>
            <div className="max-h-[220px] overflow-y-auto">
                {canCreate && (
                    <button type="button" onClick={() => { commit([...tags, needle]); setDraft(''); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-primary transition-colors hover:bg-surface-hover">
                        <Plus size={14} strokeWidth={2} className="text-accent" />
                        <span className="min-w-0 flex-1 truncate">Create “{needle}”</span>
                    </button>
                )}
                {shown.map((tag) => {
                    const on = tags.includes(tag);
                    return (
                        <button key={tag} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(tag)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-primary transition-colors hover:bg-surface-hover">
                            <span className="flex w-4 justify-center">{on && <Check size={14} strokeWidth={2.2} className="text-accent" />}</span>
                            <span className="min-w-0 flex-1 truncate">{tag}</span>
                        </button>
                    );
                })}
                {shown.length === 0 && !canCreate && <p className="px-2.5 py-2 text-sm text-tertiary">No tags yet. Type one to create it.</p>}
            </div>
        </div>
    );
}
