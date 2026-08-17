const fs = require('fs');
const p = 'apps/web/app/desk/inbox/page.tsx';
let c = fs.readFileSync(p, 'utf8');

// 1. Remove all stray git marker lines (>>>>>>> and =======)
c = c.replace(/^[<>]{7,}.*$\n?/gm, '');
c = c.replace(/^=======\s*$\n?/gm, '');

// 2. Remove duplicate CHANNEL_ICONS - the old one after ListSkeleton with { icon: React.ComponentType } type
c = c.replace(
  /\nconst CHANNEL_ICONS: Record<string, \{ icon: React\.ComponentType<\{ className\?: string \}> \} > = \{[\s\S]*?\};\n\n/g,
  ''
);

// 3. Fix CHANNEL_ICONS usage in ConversationRow - simplify
c = c.replace(
  'const meta = (CHANNEL_ICONS[c] || { icon: MessageSquare });\n                  const Icon = meta.icon;',
  'const Icon = CHANNEL_ICONS[c] || MessageSquare;'
);

// 4. Remove title="Starred" from Star (lucide-react doesn't support it)
c = c.replace(
  '<Star size={11} className="ibx-row__star fill-current text-warning" aria-label="Starred" title="Starred" />',
  '<Star size={11} className="ibx-row__star fill-current text-warning" aria-label="Starred" />'
);

// 5. Clean up triple+ blank lines
c = c.replace(/\n{3,}/g, '\n\n\n');

fs.writeFileSync(p, c);
console.log('All issues fixed successfully.');
