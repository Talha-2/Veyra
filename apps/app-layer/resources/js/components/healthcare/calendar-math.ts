export function calendarTicks(start: number, end: number): number[] {
    return Array.from({ length: (end - start) / 30 }, (_, i) => start + i * 30);
}
