import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import katex from 'katex';
import { marked } from 'marked';

/**
 * Safely renders Markdown with GFM tables, KaTeX math ($...$ and $$...$$),
 * and Highlight.js syntax highlighting, strictly sanitized via DOMPurify.
 */
export function renderSafeMarkdownHtml(rawMd: string): string {
  const codeTokens: string[] = [];
  const mathTokens: { expr: string; display: boolean }[] = [];

  let text = String(rawMd || '').replace(/\r\n?/g, '\n');

  // Strip frontmatter if user pasted a full .md file
  const fmMatch = text.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    text = fmMatch[1];
  }

  // 1. Protect fenced & inline code blocks from math parsing
  text = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    const token = `@@CODEBLOCK${codeTokens.length}@@`;
    codeTokens.push(match);
    return token;
  });

  // 2. Extract display math $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr: string) => {
    const token = `@@MATHTOKEN${mathTokens.length}@@`;
    mathTokens.push({ expr: expr.trim(), display: true });
    return token;
  });

  // 3. Extract inline math $...$
  text = text.replace(/(^|[^\\])\$([^\n$]+?)(?<!\\)\$/g, (_match, prefix: string, expr: string) => {
    const token = `@@MATHTOKEN${mathTokens.length}@@`;
    mathTokens.push({ expr: expr.trim(), display: false });
    return `${prefix}${token}`;
  });

  // 4. Restore code blocks before Markdown parsing
  text = text.replace(/@@CODEBLOCK(\d+)@@/g, (_m, idx: string) => codeTokens[Number(idx)] ?? '');

  // 5. Parse Markdown with GFM
  const parsed = marked.parse(text, { gfm: true, breaks: false, async: false }) as string;

  // 6. Sanitize HTML strictly (blocks scripts, event handlers, javascript: URIs)
  let cleanHtml = DOMPurify.sanitize(parsed, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/)|#)/i,
  });

  // 7. Render extracted KaTeX expressions safely and inject back
  mathTokens.forEach((item, index) => {
    const rendered = katex.renderToString(item.expr, {
      displayMode: item.display,
      throwOnError: false,
      strict: false,
      trust: false,
    });
    const safeMath = DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true, mathMl: true, svg: true },
      ADD_ATTR: ['style', 'class', 'aria-hidden'],
    });
    cleanHtml = cleanHtml.replace(`@@MATHTOKEN${index}@@`, () => safeMath);
  });

  return cleanHtml;
}

/**
 * Enhances a mounted preview container: wraps tables for horizontal scroll,
 * applies highlight.js to code blocks, and attaches working Copy buttons.
 */
export function enhancePreviewContainer(container: HTMLElement): void {
  // Wrap tables cleanly
  container.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('md-table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'md-table-wrap';
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  // Enhance fenced code blocks with language header & copy button
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.parentElement?.classList.contains('md-code-wrap')) return;
    const codeEl = pre.querySelector('code');
    if (!codeEl) return;

    const langClass = Array.from(codeEl.classList).find((c) => c.startsWith('language-'));
    const langName = langClass ? langClass.replace('language-', '').toUpperCase() : 'CODE';

    try {
      hljs.highlightElement(codeEl as HTMLElement);
    } catch {
      // ignore unsupported language highlight error
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'md-code-wrap';

    const header = document.createElement('div');
    header.className = 'md-code-header';

    const langSpan = document.createElement('span');
    langSpan.textContent = langName;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'md-code-copy';
    copyBtn.textContent = 'Sao chép';
    copyBtn.addEventListener('click', () => {
      const text = codeEl.textContent || '';
      navigator.clipboard?.writeText(text).then(() => {
        copyBtn.textContent = 'Đã chép';
        setTimeout(() => {
          copyBtn.textContent = 'Sao chép';
        }, 1800);
      });
    });

    header.appendChild(langSpan);
    header.appendChild(copyBtn);
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });

  // Ensure external links open safely without opener
  container.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
}
