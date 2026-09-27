/** English names for the language codes the agent and the voice catalog use. */
export const LANGUAGE_LABELS: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    hi: 'Hindi',
    ar: 'Arabic',
    ur: 'Urdu',
    it: 'Italian',
    ja: 'Japanese',
    zh: 'Chinese',
    sv: 'Swedish',
    th: 'Thai',
    he: 'Hebrew',
    or: 'Odia',
};

export const languageLabel = (code: string): string => LANGUAGE_LABELS[code] ?? code.toUpperCase();

/** "English, Spanish and Urdu" — a list the way a person would say it. */
export function sayList(items: string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
