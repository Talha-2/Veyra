import { Check, Copy } from 'lucide-react';
import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Assistant prose. Agent output is untrusted text, and react-markdown never
 * renders raw HTML, so a reply cannot inject markup. Links open in a new tab;
 * fenced code gets a header with the language and a copy button.
 */
function CodeBlock({ children, language }: { children: ReactNode; language: string }) {
    const [copied, setCopied] = useState(false);
    const text = String(extractText(children)).replace(/\n$/, '');
    return (
        <div className="my-3 overflow-hidden rounded-md border border-border bg-surface-sunken">
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                <span className="text-2xs font-medium text-tertiary">{language || 'text'}</span>
                <button type="button" className="flex items-center gap-1 text-2xs font-medium text-tertiary transition-colors hover:text-primary"
                    onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="m-0 overflow-x-auto border-0 bg-transparent p-3 text-xs leading-relaxed"><code>{text}</code></pre>
        </div>
    );
}

function extractText(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node && typeof node === 'object' && 'props' in node) return extractText((node as { props: { children?: ReactNode } }).props.children);
    return '';
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
    return (
        <div className="v-prose" dir="auto">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
                    pre: ({ children }) => {
                        const child = Array.isArray(children) ? children[0] : children;
                        const className = (child as { props?: { className?: string } })?.props?.className ?? '';
                        return <CodeBlock language={className.replace('language-', '')}>{(child as { props?: { children?: ReactNode } })?.props?.children ?? children}</CodeBlock>;
                    },
                    table: ({ children }) => <div className="my-3 overflow-x-auto"><table>{children}</table></div>,
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
});
