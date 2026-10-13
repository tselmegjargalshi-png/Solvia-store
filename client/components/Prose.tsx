import type { ReactNode } from 'react';

/**
 * Render the small Markdown subset used by blog posts and content pages
 * (## headings, - lists, paragraphs, **bold**). Text is rendered as React text
 * nodes, never as HTML, so stored content cannot inject markup or script.
 */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

export function Prose({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter(Boolean);
        if (!lines.length) return null;
        if (lines[0].startsWith('### ')) return <h3 key={i}>{inline(lines[0].slice(4))}</h3>;
        if (lines[0].startsWith('## ')) {
          return (
            <div key={i}>
              <h2>{inline(lines[0].slice(3))}</h2>
              {lines.slice(1).length > 0 && <p>{inline(lines.slice(1).join(' '))}</p>}
            </div>
          );
        }
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, k) => (
                <li key={k}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}
