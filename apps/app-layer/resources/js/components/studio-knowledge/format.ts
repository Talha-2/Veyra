/** Bytes the way Finder says them: 820 bytes, 14 KB, 2.3 MB. */
export function formatBytes(bytes: number): string {
    if (bytes < 1000) return `${bytes} bytes`;
    if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
    return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
    return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The search terms the server matches on: lowercased words longer than two letters. */
export function searchTerms(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
}

/** Split text into plain and matched runs, for highlighting search hits. */
export function splitHits(text: string, terms: string[]): { text: string; hit: boolean }[] {
    if (terms.length === 0) return [{ text, hit: false }];
    const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

    return text.split(pattern).filter(Boolean).map((part) => ({ text: part, hit: terms.includes(part.toLowerCase()) }));
}
