import DOMPurify from 'dompurify';

const ALLOWED_RICH_TAGS = [
  'p',
  'div',
  'br',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'font',
  'sub',
  'sup',
];

const ALLOWED_RICH_ATTRS = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'style',
  'align',
  'colspan',
  'rowspan',
  'cellpadding',
  'cellspacing',
  'border',
  'color',
  'face',
  'size',
];

const FORBID_RICH_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'style',
  'link',
  'meta',
  'base',
  'svg',
  'math',
];

const RICH_URI_REGEXP =
  /^(?:(?:https?|mailto|tel|cid):|data:image\/(?:png|jpe?g|gif|webp|bmp);base64,|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

/**
 * Sanitiza o HTML do editor rich-text mantendo formatação, listas, links, tabelas e imagens inline seguras.
 */
export function sanitizeRichEditorHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ALLOWED_RICH_TAGS,
    ALLOWED_ATTR: ALLOWED_RICH_ATTRS,
    FORBID_TAGS: FORBID_RICH_TAGS,
    FORBID_ATTR: ['srcdoc', 'formaction'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: RICH_URI_REGEXP,
  });
}

/**
 * Limpa marcação HTML colada de sites ou editores externos preservando estrutura e estilos úteis.
 */
export function sanitizePastedHtml(rawHtml: string): string {
  const sanitized = sanitizeRichEditorHtml(rawHtml);
  if (!sanitized || typeof DOMParser === 'undefined') return sanitized;

  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  const elements = doc.body.querySelectorAll('*');
  const preserveDimensionsTags = new Set(['IMG', 'TABLE', 'TD', 'TH']);

  elements.forEach((el) => {
    el.removeAttribute('class');
    el.removeAttribute('id');

    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (href && !href.startsWith('mailto:')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    const htmlEl = el as HTMLElement;
    if (htmlEl.style) {
      htmlEl.style.removeProperty('background');
      htmlEl.style.removeProperty('background-color');
      htmlEl.style.removeProperty('background-image');
      htmlEl.style.removeProperty('position');
      htmlEl.style.removeProperty('top');
      htmlEl.style.removeProperty('left');
      htmlEl.style.removeProperty('right');
      htmlEl.style.removeProperty('bottom');
      htmlEl.style.removeProperty('z-index');

      if (!preserveDimensionsTags.has(el.tagName)) {
        htmlEl.style.removeProperty('width');
        htmlEl.style.removeProperty('height');
        htmlEl.style.removeProperty('min-width');
        htmlEl.style.removeProperty('min-height');
        htmlEl.style.removeProperty('max-width');
        htmlEl.style.removeProperty('max-height');
      }

      if (el.tagName === 'IMG') {
        htmlEl.style.maxWidth = '100%';
        htmlEl.style.height = 'auto';
      }

      if (!htmlEl.getAttribute('style')?.trim()) {
        el.removeAttribute('style');
      }
    }
  });

  return doc.body.innerHTML;
}

/**
 * Converte HTML do editor rich-text em texto plano limpo para part text/plain e prévia.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|tr|li|blockquote|h[1-6]|pre)>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' [Imagem] ');

  let text = withBreaks;
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    text = doc.body.textContent || '';
  } else {
    text = withBreaks
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Converte texto plano inicial em HTML seguro para inicializar o editor contentEditable.
 */
export function plainTextToEditorHtml(text: string): string {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return escaped
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `<div>${line}</div>` : '<div><br/></div>'))
    .join('');
}

/**
 * Verifica se há conteúdo visível no corpo (texto, imagem inline ou tabela).
 */
export function hasRichBodyContent(html: string, plainText: string): boolean {
  if (plainText && plainText.trim().length > 0) return true;
  if (!html) return false;
  return /<img\b/i.test(html) || /<table\b/i.test(html);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Converte um arquivo ou Blob de imagem para Data URL otimizada (preservando GIF animado).
 */
export async function fileToOptimizedDataUrl(file: File | Blob): Promise<string> {
  if (file.type === 'image/gif') {
    return readBlobAsDataUrl(file);
  }

  const rawDataUrl = await readBlobAsDataUrl(file);
  if (!rawDataUrl.startsWith('data:image/')) {
    return rawDataUrl;
  }

  const maxWidth = 1400;
  const maxBytesBeforeCompress = 900 * 1024;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      imageEl.onload = () => resolve(imageEl);
      imageEl.onerror = () => reject(new Error('Falha ao decodificar imagem'));
      imageEl.src = rawDataUrl;
    });

    const needsResize = img.naturalWidth > maxWidth;
    const needsCompress = file.size > maxBytesBeforeCompress;
    if (!needsResize && !needsCompress) {
      return rawDataUrl;
    }

    const scale = needsResize ? maxWidth / img.naturalWidth : 1;
    const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const keepPng = file.type === 'image/png' && file.size <= 450 * 1024;
    if (keepPng) {
      return canvas.toDataURL('image/png');
    }
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return rawDataUrl;
  }
}

/**
 * Gera HTML de tabela compatível com clientes de e-mail (CSS 100% inline).
 */
export function buildEmailSafeTableHtml(rows: number, cols: number): string {
  const safeRows = Math.min(12, Math.max(1, Math.round(rows)));
  const safeCols = Math.min(8, Math.max(1, Math.round(cols)));

  const rowHtmlList: string[] = [];
  for (let r = 0; r < safeRows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < safeCols; c++) {
      if (r === 0) {
        cells.push(
          `<th style="border:1px solid #cbd5e1;padding:6px 8px;background-color:#f1f5f9;color:#0f172a;font-weight:600;text-align:left;">Coluna ${c + 1}</th>`
        );
      } else {
        cells.push(
          `<td style="border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top;">&nbsp;</td>`
        );
      }
    }
    rowHtmlList.push(`<tr>${cells.join('')}</tr>`);
  }

  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:10px 0;font-size:13px;"><tbody>${rowHtmlList.join('')}</tbody></table><p><br/></p>`;
}
