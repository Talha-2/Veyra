import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';

export interface KanbanColumn { id: string | number; name: string; color?: string }
export interface KanbanCard { id: number; columnId: string | number; position: number }

type Target = { column: string; index: number };

/**
 * A board of stage columns with native HTML5 drag and drop.
 *
 * The interaction is "move a card to a column at a position": `onMove` gets
 * the card, the destination column and the index it will occupy there once
 * moved (the card itself not counted), which is what the server stores.
 *
 * - Columns are 312px on a sunken track, headed by a status dot, the name, a
 *   count and optional meta (a lead column's total value).
 * - While dragging, the source card becomes a dashed placeholder, the target
 *   column lights up and an accent line shows exactly where it will land.
 * - A drop moves the card at once; the server's answer then settles it.
 * - The board scrolls sideways with a trackpad, shift + wheel, or by holding
 *   a dragged card near either edge; the edges fade while there is more.
 * - A column's body scrolls on its own only when it is taller than the
 *   window, so a long stage never pushes the rest of the board off screen.
 */
export default function Kanban<T extends KanbanCard>({
    columns, cards, renderCard, onMove, columnFooter, columnMeta, onAdd, addLabel = 'Add', emptyLabel = 'Nothing here',
}: {
    columns: KanbanColumn[];
    cards: T[];
    renderCard: (card: T) => ReactNode;
    onMove: (cardId: number, columnId: string | number, position: number) => void;
    columnFooter?: (column: KanbanColumn, cards: T[]) => ReactNode;
    /** Shown at the right of a column's header, after the count. */
    columnMeta?: (column: KanbanColumn, cards: T[]) => ReactNode;
    /** "+ Add" at the foot of every column. */
    onAdd?: (column: KanbanColumn) => void;
    addLabel?: string;
    emptyLabel?: string;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<Target | null>(null);
    const [fade, setFade] = useState({ left: false, right: false });

    // A drop shows at once; it is dropped again when the server's cards arrive.
    const [optimistic, setOptimistic] = useState<{ id: number; column: string; index: number } | null>(null);
    const signature = cards.map((c) => `${c.id}:${c.columnId}:${c.position}`).join(',');
    useEffect(() => { setOptimistic(null); }, [signature]);

    const byColumn = useMemo(() => {
        const map = new Map<string, T[]>(columns.map((c) => [String(c.id), []]));
        const moved = optimistic ? cards.find((c) => c.id === optimistic.id) : undefined;
        for (const card of cards) {
            if (moved && card.id === moved.id) continue;
            map.get(String(card.columnId))?.push(card);
        }
        for (const list of map.values()) list.sort((a, b) => a.position - b.position);
        if (moved && optimistic) map.get(optimistic.column)?.splice(optimistic.index, 0, moved);
        return map;
    }, [cards, columns, optimistic]);

    // Edge fades: only on the side where there is more to see.
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const update = () => setFade({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
        update();
        el.addEventListener('scroll', update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
    }, [columns.length]);

    // Shift + wheel scrolls sideways on every platform, not only where the OS maps it.
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const onDragStart = (e: DragEvent<HTMLDivElement>, id: number) => {
        // The browser snapshots the element for the drag image synchronously,
        // so the lifted look is applied for that one frame only.
        const el = e.currentTarget;
        el.style.boxShadow = 'var(--shadow-overlay)';
        el.style.transform = 'rotate(1.5deg)';
        requestAnimationFrame(() => { el.style.boxShadow = ''; el.style.transform = ''; });

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(id));
        // Set state a tick later so the placeholder does not become the drag image.
        setTimeout(() => setDragging(id), 0);
    };

    const end = () => { setDragging(null); setOver(null); };

    /** Where in this column the pointer is: before the first card whose middle is below it. */
    const indexAt = (column: HTMLElement, y: number) => {
        const els = Array.from(column.querySelectorAll<HTMLElement>('[data-kanban-card]'));
        const i = els.findIndex((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
        return i === -1 ? els.length : i;
    };

    const onColumnDragOver = (e: DragEvent<HTMLElement>, column: string) => {
        if (dragging == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const index = indexAt(e.currentTarget, e.clientY);
        if (!over || over.column !== column || over.index !== index) setOver({ column, index });

        // Hold a card near an edge to scroll the board.
        const el = scroller.current;
        if (el) {
            const r = el.getBoundingClientRect();
            if (e.clientX < r.left + 72) el.scrollLeft -= 14;
            else if (e.clientX > r.right - 72) el.scrollLeft += 14;
        }
    };

    const onDrop = (e: DragEvent<HTMLElement>, column: string, originalId: string | number) => {
        e.preventDefault();
        const id = Number(e.dataTransfer.getData('text/plain')) || dragging;
        const target = over;
        end();
        if (!id || !target || target.column !== column) return;

        const list = byColumn.get(column) ?? [];
        const from = list.findIndex((c) => c.id === id);
        // The index counted the card itself when it sat above the drop point.
        const index = from !== -1 && from < target.index ? target.index - 1 : target.index;
        if (from === index) return;

        setOptimistic({ id, column, index });
        onMove(id, originalId, index);
    };

    const mask = fade.left || fade.right
        ? `linear-gradient(to right, ${fade.left ? 'transparent 0, #000 48px' : '#000 0'}, ${fade.right ? '#000 calc(100% - 48px), transparent 100%' : '#000 100%'})`
        : undefined;

    return (
        <div ref={scroller} className="-mx-2 flex items-start gap-4 overflow-x-auto px-2 pt-0.5 pb-5"
            style={{ maskImage: mask, WebkitMaskImage: mask, scrollbarGutter: 'stable' }} onDragEnd={end}>
            {columns.map((col) => {
                const key = String(col.id);
                const colCards = byColumn.get(key) ?? [];
                const isOver = dragging != null && over?.column === key;
                const from = colCards.findIndex((c) => c.id === dragging);
                // No line where the card already is: dropping there changes nothing.
                const showLineAt = isOver && over && !(from !== -1 && (over.index === from || over.index === from + 1)) ? over.index : -1;

                return (
                    <section key={key} aria-label={`${col.name}, ${colCards.length}`}
                        className="flex w-[312px] shrink-0 flex-col rounded-[var(--radius-lg)] transition-[background-color,box-shadow] duration-150"
                        style={{
                            background: isOver ? 'color-mix(in srgb, var(--accent) 5%, var(--surface-sunken))' : 'var(--surface-sunken)',
                            boxShadow: isOver ? 'inset 0 0 0 1.5px var(--border-accent)' : 'inset 0 0 0 1px var(--border)',
                        }}
                        onDragOver={(e) => onColumnDragOver(e, key)}
                        onDrop={(e) => onDrop(e, key, col.id)}>
                        <header className="flex h-13 shrink-0 items-center gap-2.5 px-4">
                            {col.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: col.color }} aria-hidden="true" />}
                            <h3 className="min-w-0 truncate text-base font-semibold text-primary">{col.name}</h3>
                            <span className="inline-flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-secondary tabular-nums"
                                style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--border)' }}>
                                {colCards.length}
                            </span>
                            <span className="flex-1" />
                            {columnMeta && <span className="shrink-0 text-sm font-medium text-secondary tabular-nums">{columnMeta(col, colCards)}</span>}
                        </header>

                        <div className="flex max-h-[calc(100vh-13rem)] min-h-28 flex-col overflow-y-auto px-2.5 pb-1" style={{ overscrollBehavior: 'contain' }}>
                            {colCards.map((card, i) => (
                                <div key={card.id}>
                                    <DropLine visible={showLineAt === i} />
                                    <div data-kanban-card draggable onDragStart={(e) => onDragStart(e, card.id)}
                                        className="mb-2.5 cursor-grab rounded-[var(--radius-lg)] transition-[opacity,transform] duration-150 active:cursor-grabbing"
                                        style={dragging === card.id ? { opacity: 0.4, outline: '1.5px dashed var(--border-strong)', outlineOffset: -1 } : undefined}>
                                        {renderCard(card)}
                                    </div>
                                </div>
                            ))}
                            <DropLine visible={showLineAt === colCards.length && colCards.length > 0} />

                            {colCards.length === 0 && (
                                <div className="mb-2.5 flex min-h-24 flex-1 items-center justify-center rounded-[var(--radius-md)] px-4 text-center text-sm transition-colors"
                                    style={{
                                        border: `1.5px dashed ${isOver ? 'var(--border-accent)' : 'var(--border-strong)'}`,
                                        color: isOver ? 'var(--accent-text)' : 'var(--text-tertiary)',
                                        background: isOver ? 'var(--accent-subtle)' : 'transparent',
                                    }}>
                                    {isOver ? 'Drop here' : emptyLabel}
                                </div>
                            )}
                        </div>

                        {onAdd && (
                            <div className="shrink-0 px-2.5 pb-2.5">
                                <button type="button" onClick={() => onAdd(col)}
                                    className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary">
                                    <Plus size={15} strokeWidth={2} />{addLabel}
                                </button>
                            </div>
                        )}

                        {columnFooter && (
                            <footer className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid var(--separator)' }}>{columnFooter(col, colCards)}</footer>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

function DropLine({ visible }: { visible: boolean }) {
    return (
        <div aria-hidden="true" className="relative transition-[height,margin] duration-150" style={{ height: visible ? 3 : 0, marginBottom: visible ? 10 : 0 }}>
            {visible && (
                <>
                    <span className="absolute inset-x-1 top-0 h-[3px] rounded-full" style={{ background: 'var(--accent)' }} />
                    <span className="absolute top-1/2 -left-0.5 size-2 -translate-y-1/2 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 0 2px var(--surface-sunken)' }} />
                </>
            )}
        </div>
    );
}
