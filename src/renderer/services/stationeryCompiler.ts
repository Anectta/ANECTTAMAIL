import { sanitizeRichEditorHtml } from '../utils/richTextUtils';

export interface StationeryTemplate {
  id: string;
  name: string;
  category: 'Corporativo' | 'Formal' | 'Minimalista' | 'Festivo';
  description: string;
  previewBorder: string;
  previewBg: string;
  textColor: string;
}

export const STATIONERY_TEMPLATES: StationeryTemplate[] = [
  {
    id: 'clean',
    name: 'Padrão Moderno (Sem Moldura)',
    category: 'Minimalista',
    description: 'Design limpo, minimalista e direto ao ponto.',
    previewBorder: 'border-slate-700',
    previewBg: 'bg-slate-900',
    textColor: '#e2e8f0',
  },
  {
    id: 'anectta-executive',
    name: 'Anectta Executive Blue',
    category: 'Corporativo',
    description: 'Fundo sutil com borda lateral azul royal e cabeçalho executivo.',
    previewBorder: 'border-l-4 border-l-blue-500 border-slate-700',
    previewBg: 'bg-slate-900',
    textColor: '#f8fafc',
  },
  {
    id: 'parchment-formal',
    name: 'Pergaminho Jurídico / Clássico',
    category: 'Formal',
    description: 'Borda dupla dourada clássica e fundo pergaminho suave.',
    previewBorder: 'border-2 border-amber-600/80',
    previewBg: 'bg-stone-900',
    textColor: '#fef3c7',
  },
  {
    id: 'dark-cyber',
    name: 'Cyber Noir / Dark Elegance',
    category: 'Corporativo',
    description: 'Borda iluminada em ciano com cantos geométricos de alta tecnologia.',
    previewBorder: 'border-2 border-cyan-500/80',
    previewBg: 'bg-slate-950',
    textColor: '#ecfeff',
  },
  {
    id: 'corporate-memo',
    name: 'Memorando Oficial Interno',
    category: 'Formal',
    description: 'Estrutura formal com cabeçalho de memorando e linha divisória.',
    previewBorder: 'border-t-4 border-t-indigo-500 border-slate-800',
    previewBg: 'bg-slate-900',
    textColor: '#f1f5f9',
  },
  {
    id: 'festive-celebration',
    name: 'Boas Festas & Celebração',
    category: 'Festivo',
    description: 'Borda comemorativa com detalhes em esmeralda e dourado.',
    previewBorder: 'border-2 border-emerald-500',
    previewBg: 'bg-slate-900',
    textColor: '#ecfdf5',
  },
];

export interface StickerPreset {
  id: string;
  name: string;
  url: string;
  tag: string;
}

export const ANIMATED_STICKERS: StickerPreset[] = [
  {
    id: 'approved-check',
    name: 'Aprovado / Sucesso',
    url: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif',
    tag: 'Sucesso',
  },
  {
    id: 'rocket-launch',
    name: 'Decolagem / Go-Live',
    url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
    tag: 'Lançamento',
  },
  {
    id: 'handshake-deal',
    name: 'Parceria / Acordo Fechado',
    url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
    tag: 'Negócios',
  },
  {
    id: 'coffee-break',
    name: 'Pausa para Café / Alinhamento',
    url: 'https://media.giphy.com/media/hPTZgtzfRIB5Nfb5rL/giphy.gif',
    tag: 'Equipe',
  },
  {
    id: 'celebrate-confetti',
    name: 'Comemoração / Parabéns',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    tag: 'Celebração',
  },
  {
    id: 'urgent-alert',
    name: 'Prioridade / Atenção',
    url: 'https://media.giphy.com/media/l41lFw057lAJQMwg0/giphy.gif',
    tag: 'Alerta',
  },
];

export type OutgoingAnimationType = 'airplane' | 'rocket' | 'wax-seal' | 'instant';

export interface OutgoingAnimationOption {
  id: OutgoingAnimationType;
  name: string;
  description: string;
  iconName: string;
}

export const OUTGOING_ANIMATIONS: OutgoingAnimationOption[] = [
  {
    id: 'airplane',
    name: 'Avião de Papel (Dobra & Voo)',
    description: 'O envelope dobra-se em um avião elegante e decola com rastro.',
    iconName: 'Send',
  },
  {
    id: 'rocket',
    name: 'Foguete Warp Speed',
    description: 'Disparo relâmpago de alta aceleração para mensagens prioritárias.',
    iconName: 'Rocket',
  },
  {
    id: 'wax-seal',
    name: 'Selo de Cera Oficial',
    description: 'O envelope é carimbado e selado com brasão executivo dourado.',
    iconName: 'Shield',
  },
  {
    id: 'instant',
    name: 'Despacho Sutil / Rápido',
    description: 'Transição suave sem animação cinematográfica.',
    iconName: 'Zap',
  },
];

interface CompileOptions {
  text: string;
  bodyHtml?: string;
  stationeryId: string;
  senderName: string;
  senderEmail: string;
  signature?: string;
  insertedGifs?: string[];
  subject?: string;
}

function applyEmailSafeInlineFallbacks(sanitizedHtml: string): string {
  if (!sanitizedHtml || typeof DOMParser === 'undefined') return sanitizedHtml;
  const doc = new DOMParser().parseFromString(sanitizedHtml, 'text/html');

  doc.body.querySelectorAll('table').forEach((el) => {
    const htmlEl = el as HTMLTableElement;
    if (!htmlEl.style.borderCollapse) htmlEl.style.borderCollapse = 'collapse';
    if (!htmlEl.style.margin) htmlEl.style.margin = '10px 0';
  });

  doc.body.querySelectorAll('td, th').forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (!htmlEl.style.border) htmlEl.style.border = '1px solid #cbd5e1';
    if (!htmlEl.style.padding) htmlEl.style.padding = '6px 8px';
  });

  doc.body.querySelectorAll('blockquote').forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (!htmlEl.style.borderLeft) htmlEl.style.borderLeft = '3px solid #94a3b8';
    if (!htmlEl.style.padding) htmlEl.style.padding = '6px 14px';
    if (!htmlEl.style.margin) htmlEl.style.margin = '10px 0';
    if (!htmlEl.style.color) htmlEl.style.color = '#475569';
  });

  doc.body.querySelectorAll('img').forEach((el) => {
    const imgEl = el as HTMLImageElement;
    if (!imgEl.style.maxWidth) imgEl.style.maxWidth = '100%';
    if (!imgEl.style.height) imgEl.style.height = 'auto';
  });

  doc.body.querySelectorAll('ul, ol').forEach((el) => {
    const listEl = el as HTMLElement;
    if (!listEl.style.margin) listEl.style.margin = '8px 0';
    if (!listEl.style.paddingLeft) listEl.style.paddingLeft = '22px';
  });

  doc.body.querySelectorAll('p').forEach((el) => {
    const pEl = el as HTMLElement;
    if (!pEl.style.margin) pEl.style.margin = '0 0 10px 0';
  });

  doc.body.querySelectorAll('a').forEach((el) => {
    const aEl = el as HTMLAnchorElement;
    if (!aEl.style.color) aEl.style.color = '#2563eb';
    if (!aEl.style.textDecoration) aEl.style.textDecoration = 'underline';
  });

  return doc.body.innerHTML;
}

/**
 * Compila o texto, HTML rico, papel de carta, GIFs e assinatura em HTML com CSS 100% inline,
 * garantindo compatibilidade total com Outlook, Gmail, Thunderbird e Webmail.
 */
export function compileToInlineHtml(options: CompileOptions): string {
  const { text, bodyHtml, signature } = options;

  let bodyContentHtml = '';
  if (bodyHtml && bodyHtml.trim()) {
    const sanitized = sanitizeRichEditorHtml(bodyHtml);
    const enhanced = applyEmailSafeInlineFallbacks(sanitized);
    if (enhanced.trim()) {
      bodyContentHtml = `<div style="font-size: 14px; line-height: 1.6;">${enhanced}</div>`;
    }
  }

  if (!bodyContentHtml) {
    bodyContentHtml = text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin: 0 0 16px 0; line-height: 1.6; font-size: 14px;">${p.replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }

  const formattedSignature = signature
    ? /<[a-z][\s\S]*>/i.test(signature)
      ? signature
      : signature.replace(/\n/g, '<br/>')
    : '';

  const signatureHtml = formattedSignature
    ? `<div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 13px; color: #64748b; line-height: 1.5;">
        ${formattedSignature}
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <div style="max-width: 620px; margin: 0 auto;">
    ${bodyContentHtml}
    ${signatureHtml}
  </div>
</body>
</html>`.trim();
}
