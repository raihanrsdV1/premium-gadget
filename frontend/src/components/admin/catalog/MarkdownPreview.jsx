import React from 'react';
import { isValidLink } from './catalogUtils';

/**
 * Small, safe Markdown preview for product descriptions: headings, bold,
 * italic, bullet / numbered lists, links and paragraphs. Everything is built
 * as React elements (no HTML injection), so typed HTML shows as plain text.
 * The website renders the full Markdown; this is a close-enough preview.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\([^)\s]+\))/g;

const inline = (text, depth = 0) => {
  if (!text) return null;
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (depth < 2) {
      let m = part.match(/^\*\*([^*]+)\*\*$/);
      if (m) return <strong key={i}>{inline(m[1], depth + 1)}</strong>;
      m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (m) {
        const href = m[2];
        return isValidLink(href)
          ? <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">{inline(m[1], depth + 1)}</a>
          : <span key={i}>{m[1]}</span>;
      }
      m = part.match(/^\*([^*]+)\*$/);
      if (m) return <em key={i}>{inline(m[1], depth + 1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
};

const parseBlocks = (src) => {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) { flushPara(); flushList(); return; }
    if (heading) { flushPara(); flushList(); blocks.push({ type: 'h', level: heading[1].length, text: heading[2] }); return; }
    if (bullet || numbered) {
      flushPara();
      const type = bullet ? 'ul' : 'ol';
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((bullet || numbered)[1]);
      return;
    }
    if (list) flushList();
    para.push(line.trim());
  });
  flushPara();
  flushList();
  return blocks;
};

const HEADING_CLASS = ['text-xl font-bold', 'text-lg font-bold', 'text-base font-semibold', 'text-sm font-semibold', 'text-sm font-semibold', 'text-sm font-semibold'];

export const MarkdownPreview = ({ source, empty = 'Nothing to preview yet.' }) => {
  const blocks = parseBlocks(source);
  if (!blocks.length) return <p className="text-sm italic text-slate-400">{empty}</p>;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-800">
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const Tag = `h${Math.min(b.level + 2, 6)}`;
          return <Tag key={i} className={`${HEADING_CLASS[b.level - 1]} text-slate-900`}>{inline(b.text)}</Tag>;
        }
        if (b.type === 'ul') return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>;
        if (b.type === 'ol') return <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>;
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
};

export default MarkdownPreview;
