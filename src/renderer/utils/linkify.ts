/**
 * Transforma endereços escritos como texto ("https://...", "www...." e e-mails) em links
 * clicáveis, tanto em e-mails só de texto quanto em trechos de texto dentro de e-mails HTML.
 */

export type TextPart = { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

// URL (http/https/www) ou endereço de e-mail
const LINK_RE =
  /\b((?:https?:\/\/|www\.)[^\s<>"'`]+)|\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

/** Remove pontuação final que normalmente não faz parte do link ("veja https://x.com/a."). */
function trimTrailing(url: string): string {
  let out = url;
  for (;;) {
    const last = out.slice(-1);
    if (/[.,;:!?'"]/.test(last)) {
      out = out.slice(0, -1);
      continue;
    }
    // Parêntese/colchete de fechamento sem o de abertura correspondente no link
    if (last === ')' && (out.match(/\(/g) || []).length < (out.match(/\)/g) || []).length) {
      out = out.slice(0, -1);
      continue;
    }
    if (last === ']' && (out.match(/\[/g) || []).length < (out.match(/]/g) || []).length) {
      out = out.slice(0, -1);
      continue;
    }
    return out;
  }
}

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(text)) !== null) {
    const raw = m[1] || m[2];
    const value = m[1] ? trimTrailing(raw) : raw;
    if (!value || (m[1] && value.replace(/^(https?:\/\/|www\.)/i, '').length < 3)) continue;
    const start = m.index;
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) });
    const href = m[2] ? `mailto:${value}` : /^www\./i.test(value) ? `https://${value}` : value;
    parts.push({ type: 'link', value, href });
    last = start + value.length;
    LINK_RE.lastIndex = last;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

const SKIP_TAGS = new Set(['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'BUTTON', 'SELECT', 'OPTION']);

/** Em HTML já sanitizado: transforma endereços soltos no texto em <a href>. */
export function linkifyHtml(html: string): string {
  if (!html || !/(https?:\/\/|www\.|@)/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<div id="lk-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('lk-root');
  if (!root) return html;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    let skip = false;
    for (let p = t.parentElement; p && p !== root; p = p.parentElement) {
      if (SKIP_TAGS.has(p.tagName)) {
        skip = true;
        break;
      }
    }
    if (!skip && /(https?:\/\/|www\.|@)/i.test(t.data)) targets.push(t);
  }
  for (const t of targets) {
    const parts = splitLinks(t.data);
    if (!parts.some((p) => p.type === 'link')) continue;
    const frag = doc.createDocumentFragment();
    for (const p of parts) {
      if (p.type === 'text') {
        frag.appendChild(doc.createTextNode(p.value));
      } else {
        const a = doc.createElement('a');
        a.setAttribute('href', p.href);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.textContent = p.value;
        frag.appendChild(a);
      }
    }
    t.replaceWith(frag);
  }
  return root.innerHTML;
}
