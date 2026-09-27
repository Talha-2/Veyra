import { UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const ACCEPTED_EXTENSIONS = ['txt', 'md', 'csv', 'pdf', 'docx', 'html'];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export function isAccepted(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return ACCEPTED_EXTENSIONS.includes(ext);
}

function carriesFiles(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Files dragged anywhere onto the window. Returns whether a drag is over the
 * page, for the overlay. Counts enter/leave pairs, because every child
 * element the pointer crosses fires its own dragleave.
 */
export function useWindowFileDrop(onFiles: (files: File[]) => void, enabled = true): boolean {
    const [over, setOver] = useState(false);
    const depth = useRef(0);
    const handler = useRef(onFiles);
    handler.current = onFiles;

    useEffect(() => {
        if (!enabled) {
            depth.current = 0;
            setOver(false);
            return;
        }
        const enter = (e: DragEvent) => { if (!carriesFiles(e)) return; e.preventDefault(); depth.current++; setOver(true); };
        const overFn = (e: DragEvent) => { if (!carriesFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
        const leave = (e: DragEvent) => { if (!carriesFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); };
        const drop = (e: DragEvent) => {
            if (!carriesFiles(e)) return;
            e.preventDefault();
            depth.current = 0;
            setOver(false);
            const files = Array.from(e.dataTransfer?.files ?? []);
            if (files.length) handler.current(files);
        };
        window.addEventListener('dragenter', enter);
        window.addEventListener('dragover', overFn);
        window.addEventListener('dragleave', leave);
        window.addEventListener('drop', drop);
        return () => {
            window.removeEventListener('dragenter', enter);
            window.removeEventListener('dragover', overFn);
            window.removeEventListener('dragleave', leave);
            window.removeEventListener('drop', drop);
        };
    }, [enabled]);

    return over;
}

/** The sheet shown while files hover over the page. */
export function DropOverlay({ visible, destination }: { visible: boolean; destination: string }) {
    if (!visible) return null;

    return createPortal(
        <div className="pointer-events-none fixed inset-0 z-[110] flex animate-fade-in items-center justify-center p-6" style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            <div className="flex w-full max-w-[520px] animate-pop flex-col items-center rounded-[var(--radius-xl)] px-8 py-12 text-center" style={{ background: 'var(--surface-raised)', border: '2px dashed var(--border-accent)', boxShadow: 'var(--shadow-overlay)' }}>
                <span className="mb-4 flex size-14 items-center justify-center rounded-2xl" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                    <UploadCloud size={26} strokeWidth={1.8} />
                </span>
                <p className="text-lg font-semibold text-primary">Drop to upload to {destination}</p>
                <p className="mt-1 text-sm text-secondary">Text, Markdown, CSV and HTML are searchable right away. PDF and Word show as processing until their text is extracted.</p>
                <p className="mt-3 text-xs text-tertiary">Up to 20 files, 20 MB each</p>
            </div>
        </div>,
        document.body,
    );
}
