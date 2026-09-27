import { useState, type DragEvent, type ReactNode } from 'react';

export interface KanbanColumn { id: string | number; name: string; color?: string }
export interface KanbanCard { id: number; columnId: string | number; position: number }

/**
 * Drag-and-drop columns with native HTML5 DnD. No library: the interaction is
 * "move a card to a column at a position", and that is thirty lines.
 *
 * `onMove` fires with the destination column and the index the card was
 * dropped at, which is enough for the server to renumber positions.
 *
 * Columns are sunken tracks; cards sit raised on them and lift further while
 * dragged. Used by tickets and leads through `renderCard`.
 */
export default function Kanban<T extends KanbanCard>({
    columns, cards, renderCard, onMove, columnFooter,
}: {
    columns: KanbanColumn[];
    cards: T[];
    renderCard: (card: T) => ReactNode;
    onMove: (cardId: number, columnId: string | number, position: number) => void;
    columnFooter?: (column: KanbanColumn, cards: T[]) => ReactNode;
}) {
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<{ column: string | number; index: number } | null>(null);

    const onDragStart = (e: DragEvent<HTMLDivElement>, id: number) => {
        // Lift the card for the drag image: the browser snapshots the element
        // synchronously, so the style is set before and cleared right after.
        const el = e.currentTarget;
        el.style.boxShadow = 'var(--shadow-raised)';
        el.style.transform = 'rotate(1.2deg)';
        requestAnimationFrame(() => { el.style.boxShadow = ''; el.style.transform = ''; });

        setDragging(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(id));
    };
    const onDragOver = (e: DragEvent, column: string | number, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!over || String(over.column) !== String(column) || over.index !== index) setOver({ column, index });
    };
    const onDrop = (e: DragEvent, column: string | number, index: number) => {
        e.preventDefault();
        const id = Number(e.dataTransfer.getData('text/plain'));
        if (id) onMove(id, column, index);
        setDragging(null); setOver(null);
    };
    const end = () => { setDragging(null); setOver(null); };

    return (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
            {columns.map((col) => {
                const colCards = cards.filter((c) => String(c.columnId) === String(col.id)).sort((a, b) => a.position - b.position);
                const isOver = dragging != null && over != null && String(over.column) === String(col.id);

                return (
                    <section key={col.id} aria-label={col.name}
                        className="flex w-[288px] shrink-0 flex-col rounded-lg transition-colors"
                        style={{
                            background: isOver ? 'color-mix(in srgb, var(--accent) 6%, var(--surface-sunken))' : 'var(--surface-sunken)',
                            border: `1px solid ${isOver ? 'var(--border-accent)' : 'var(--border)'}`,
                        }}
                        onDragOver={(e) => onDragOver(e, col.id, colCards.length)} onDrop={(e) => onDrop(e, col.id, colCards.length)}>
                        <header className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
                            {col.color && <span className="size-2 shrink-0 rounded-full" style={{ background: col.color }} aria-hidden="true" />}
                            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{col.name}</h3>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold text-secondary tabular-nums"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                {colCards.length}
                            </span>
                        </header>

                        <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                            {colCards.map((card, i) => {
                                const dropHere = isOver && over!.index === i && dragging !== card.id;
                                return (
                                    <div key={card.id}>
                                        <DropLine visible={dropHere} />
                                        <div draggable onDragStart={(e) => onDragStart(e, card.id)} onDragEnd={end}
                                            onDragOver={(e) => { e.stopPropagation(); onDragOver(e, col.id, i); }} onDrop={(e) => { e.stopPropagation(); onDrop(e, col.id, i); }}
                                            className="cursor-grab rounded-lg transition-[opacity,transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-raised active:cursor-grabbing"
                                            style={{ opacity: dragging === card.id ? 0.35 : 1 }}>
                                            {renderCard(card)}
                                        </div>
                                    </div>
                                );
                            })}
                            <DropLine visible={isOver && over!.index === colCards.length} />
                            {colCards.length === 0 && (
                                <div className="flex flex-1 items-center justify-center rounded-md py-6 text-xs text-tertiary" style={{ border: '1px dashed var(--border-strong)' }}>
                                    {isOver ? 'Drop here' : 'Nothing here'}
                                </div>
                            )}
                        </div>

                        {columnFooter && <footer className="px-3.5 py-2.5" style={{ borderTop: '1px solid var(--separator)' }}>{columnFooter(col, colCards)}</footer>}
                    </section>
                );
            })}
        </div>
    );
}

function DropLine({ visible }: { visible: boolean }) {
    return <div className="mx-1 rounded-full transition-all duration-150" style={{ height: visible ? 3 : 0, marginBottom: visible ? 6 : 0, background: 'var(--accent)' }} aria-hidden="true" />;
}
