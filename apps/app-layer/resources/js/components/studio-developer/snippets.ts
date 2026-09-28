import { samplePath, sampleQuery, type Endpoint } from './openapi';

/**
 * Copyable request samples, generated from the endpoint so they cannot drift
 * from the spec. The key comes from an environment variable in every
 * language: a sample that inlines a secret teaches people to commit one.
 */

export type Lang = 'curl' | 'javascript' | 'python';

export const LANGS: { value: Lang; label: string }[] = [
    { value: 'curl', label: 'curl' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'python', label: 'Python' },
];

const json = (v: unknown, indent = 2) => JSON.stringify(v, null, indent);

/** A Python literal from JSON: true/false/null differ. */
function py(v: unknown, depth = 1): string {
    const pad = '    '.repeat(depth);
    const end = '    '.repeat(depth - 1);
    if (v === null) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (Array.isArray(v)) return v.length ? `[${v.map((x) => py(x, depth + 1)).join(', ')}]` : '[]';
    if (typeof v === 'object') {
        const entries = Object.entries(v as Record<string, unknown>);
        if (!entries.length) return '{}';
        return `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${py(x, depth + 1)}`).join(',\n')},\n${end}}`;
    }
    return JSON.stringify(v);
}

export function snippet(lang: Lang, ep: Endpoint, baseUrl: string): string {
    const url = `${baseUrl}${samplePath(ep)}${sampleQuery(ep)}`;
    const method = ep.method.toUpperCase();
    const body = ep.body?.example;
    const auth = !ep.isPublic;

    if (lang === 'curl') {
        const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} "${url}"`];
        if (auth) lines.push('  -H "Authorization: Bearer $VEYRA_API_KEY"');
        if (body !== undefined) {
            lines.push('  -H "Content-Type: application/json"');
            lines.push(`  -d '${json(body).replace(/'/g, "'\\''")}'`);
        }
        return lines.join(' \\\n');
    }

    if (lang === 'javascript') {
        const headers = [auth ? '    Authorization: `Bearer ${process.env.VEYRA_API_KEY}`,' : null, body !== undefined ? "    'Content-Type': 'application/json'," : null].filter(Boolean);
        const options = [
            method !== 'GET' ? `  method: '${method}',` : null,
            headers.length ? `  headers: {\n${headers.join('\n')}\n  },` : null,
            body !== undefined ? `  body: JSON.stringify(${json(body, 2).replace(/\n/g, '\n  ')}),` : null,
        ].filter(Boolean);
        return [
            `const res = await fetch('${url}'${options.length ? `, {\n${options.join('\n')}\n}` : ''});`,
            'if (!res.ok) throw new Error((await res.json()).error.message);',
            'const data = await res.json();',
        ].join('\n');
    }

    const args = [
        `    "${url}",`,
        auth ? '    headers={"Authorization": f"Bearer {os.environ[\'VEYRA_API_KEY\']}"},' : null,
        body !== undefined ? `    json=${py(body, 2)},` : null,
        '    timeout=10,',
    ].filter(Boolean);
    return [
        auth ? 'import os\nimport requests' : 'import requests',
        '',
        `res = requests.${ep.method}(\n${args.join('\n')}\n)`,
        'res.raise_for_status()',
        'data = res.json()',
    ].join('\n');
}

/** Webhook signature verification, per language. */
export const VERIFY: { value: string; label: string; code: string }[] = [
    {
        value: 'node',
        label: 'Node.js',
        code: `import crypto from 'node:crypto';

// Use the raw request body — not a re-serialised object.
export function isFromVeyra(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`,
    },
    {
        value: 'python',
        label: 'Python',
        code: `import hashlib
import hmac

def is_from_veyra(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")`,
    },
    {
        value: 'php',
        label: 'PHP',
        code: `function is_from_veyra(string $rawBody, string $signatureHeader, string $secret): bool
{
    $expected = 'sha256='.hash_hmac('sha256', $rawBody, $secret);

    return hash_equals($expected, $signatureHeader);
}`,
    },
];
