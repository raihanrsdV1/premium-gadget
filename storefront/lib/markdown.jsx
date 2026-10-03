/**
 * Tiny, safe Markdown renderer for product descriptions (`description_md`).
 *
 * Supported: headings, paragraphs, bold, italic, inline code, links,
 * unordered/ordered lists and horizontal rules. Everything else renders as
 * literal text. The output is React elements, never an HTML string: React
 * escapes every text node and attribute, so raw HTML in the source shows up as
 * text instead of running. Link targets are restricted to http(s) URLs and
 * site-relative paths; anything else (javascript:, data:, …) renders as plain
 * text without a link.
 */

const MAX_INPUT = 20000;
const MAX_DEPTH = 6;
const ESCAPABLE = /[\\`*_[\]()#+\-.!>~|{}]/;

// ─── Block level ─────────────────────────────────────────────────────────────

function parseBlocks(md) {
  const lines = String(md ?? "").slice(0, MAX_INPUT).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = null;
  let list = null;

  const flushPara = () => {
    if (para) blocks.push({ type: "p", text: para.join(" ") });
    para = null;
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "    ");
    const text = line.trim();
    let m;

    if (!text) {
      flush();
      continue;
    }
    // Code fences: drop the fence lines, keep the content as plain text.
    if (/^(```|~~~)/.test(text)) {
      flush();
      continue;
    }
    if ((m = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(text))) {
      flush();
      blocks.push({ type: "h", level: m[1].length, text: m[2] });
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}$/.test(text)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }
    if ((m = /^[-*+]\s+(.*)$/.exec(text))) {
      flushPara();
      if (list?.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(m[1]);
      continue;
    }
    if ((m = /^(\d{1,9})[.)]\s+(.*)$/.exec(text))) {
      flushPara();
      if (list?.type !== "ol") {
        flushList();
        list = { type: "ol", start: Number(m[1]), items: [] };
      }
      list.items.push(m[2]);
      continue;
    }
    // An indented line right after a list item continues that item.
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ` ${text}`;
      continue;
    }
    flushList();
    (para ||= []).push(text.replace(/^>\s?/, ""));
  }
  flush();
  return blocks;
}

// ─── Inline level ────────────────────────────────────────────────────────────

const isWordChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Link target allowed out of Markdown: http(s) or a relative path/fragment. */
export function safeHref(raw) {
  const url = String(raw ?? "").trim().replace(/^<(.*)>$/, "$1").split(/\s+/)[0];
  if (!url || /[\u0000-\u001F\u007F\\]/.test(url)) return null;
  if (url.startsWith("//")) return null;
  // No scheme at all (no ":" before the first "/", "?" or "#") → relative.
  const head = url.split(/[/?#]/)[0];
  if (!head.includes(":")) return url;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Index of the closing delimiter, or -1. */
function findCloser(text, from, delim) {
  const single = delim.length === 1;
  for (let j = from; j < text.length; j += 1) {
    if (text[j] === "\\") {
      j += 1;
      continue;
    }
    if (!text.startsWith(delim, j)) continue;
    if (single && (text[j + 1] === delim || text[j - 1] === delim)) continue;
    if (/\s/.test(text[j - 1] || "")) continue; // closer can't follow whitespace
    if (delim[0] === "_" && isWordChar(text[j + delim.length])) continue; // snake_case
    return j;
  }
  return -1;
}

/** `[label](url)` starting at `i` → { label, url, end } or null. */
function matchLink(text, i) {
  let depth = 0;
  let j = i;
  for (; j < text.length; j += 1) {
    if (text[j] === "\\") j += 1;
    else if (text[j] === "[") depth += 1;
    else if (text[j] === "]" && --depth === 0) break;
  }
  if (j >= text.length || text[j + 1] !== "(") return null;
  let k = j + 2;
  let parens = 1;
  for (; k < text.length; k += 1) {
    if (text[k] === "(") parens += 1;
    else if (text[k] === ")" && --parens === 0) break;
  }
  if (k >= text.length) return null;
  return { label: text.slice(i + 1, j), url: text.slice(j + 2, k), end: k + 1 };
}

function parseInline(text, depth = 0) {
  const out = [];
  let buf = "";
  const pushText = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === "\\" && ESCAPABLE.test(text[i + 1] || "")) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    if (depth < MAX_DEPTH) {
      if (c === "`") {
        const end = text.indexOf("`", i + 1);
        if (end > i + 1) {
          pushText();
          out.push({ t: "code", v: text.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }

      if (c === "[") {
        const link = matchLink(text, i);
        if (link) {
          pushText();
          const href = safeHref(link.url);
          const children = parseInline(link.label, depth + 1);
          out.push(href ? { t: "a", href, children } : { t: "span", children });
          i = link.end;
          continue;
        }
      }

      if ((c === "*" || c === "_") && text[i + 1] === c && !/\s/.test(text[i + 2] || " ")) {
        const end = findCloser(text, i + 2, c + c);
        if (end > i + 2) {
          pushText();
          out.push({ t: "strong", children: parseInline(text.slice(i + 2, end), depth + 1) });
          i = end + 2;
          continue;
        }
      }

      if (
        (c === "*" || c === "_") &&
        text[i + 1] !== c &&
        !/\s/.test(text[i + 1] || " ") &&
        !(c === "_" && isWordChar(text[i - 1]))
      ) {
        const end = findCloser(text, i + 1, c);
        if (end > i + 1) {
          pushText();
          out.push({ t: "em", children: parseInline(text.slice(i + 1, end), depth + 1) });
          i = end + 1;
          continue;
        }
      }
    }

    buf += c;
    i += 1;
  }
  pushText();
  return out;
}

// ─── Renderers ───────────────────────────────────────────────────────────────

function renderInline(nodes, keyPrefix) {
  return nodes.map((n, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (n.t) {
      case "text":
        return n.v;
      case "code":
        return <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">{n.v}</code>;
      case "strong":
        return <strong key={key} className="font-semibold text-foreground">{renderInline(n.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInline(n.children, key)}</em>;
      case "a": {
        const external = /^https?:\/\//i.test(n.href);
        return (
          <a
            key={key}
            href={n.href}
            className="text-primary underline underline-offset-2 hover:no-underline"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {renderInline(n.children, key)}
          </a>
        );
      }
      default:
        return <span key={key}>{renderInline(n.children || [], key)}</span>;
    }
  });
}

const HEADING_CLASS = {
  3: "text-xl font-semibold text-foreground",
  4: "text-lg font-semibold text-foreground",
  5: "font-semibold text-foreground",
  6: "font-semibold text-foreground",
};

/**
 * Render Markdown to React elements. Headings start at <h3> because the
 * section they sit in already has an <h2> ("Overview").
 * @returns {JSX.Element|null}
 */
export function renderMarkdown(md, { className = "space-y-4 text-muted-foreground leading-relaxed" } = {}) {
  const blocks = parseBlocks(md);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((b, idx) => {
        const key = `b${idx}`;
        switch (b.type) {
          case "h": {
            const level = Math.min(6, Math.max(3, b.level + 1));
            const Tag = `h${level}`;
            return <Tag key={key} className={HEADING_CLASS[level]}>{renderInline(parseInline(b.text), key)}</Tag>;
          }
          case "hr":
            return <hr key={key} className="border-border" />;
          case "ul":
            return (
              <ul key={key} className="list-disc pl-6 space-y-1">
                {b.items.map((it, i) => <li key={i}>{renderInline(parseInline(it), `${key}-${i}`)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} start={b.start !== 1 ? b.start : undefined} className="list-decimal pl-6 space-y-1">
                {b.items.map((it, i) => <li key={i}>{renderInline(parseInline(it), `${key}-${i}`)}</li>)}
              </ol>
            );
          default:
            return <p key={key}>{renderInline(parseInline(b.text), key)}</p>;
        }
      })}
    </div>
  );
}

function inlineText(nodes) {
  return nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.children || []))).join("");
}

/** Markdown → plain text (for meta descriptions and JSON-LD). */
export function markdownToText(md) {
  return parseBlocks(md)
    .map((b) => {
      if (b.type === "hr") return "";
      if (b.type === "ul" || b.type === "ol") return b.items.map((it) => `• ${inlineText(parseInline(it))}`).join("\n");
      const t = inlineText(parseInline(b.text));
      return b.type === "h" && !/[.!?:]$/.test(t) ? `${t}.` : t;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
