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
  stationeryId: string;
  senderName: string;
  senderEmail: string;
  signature?: string;
  insertedGifs?: string[];
  subject?: string;
}

/**
 * Compila o texto, papel de carta, GIFs e assinatura em HTML com CSS 100% inline,
 * garantindo compatibilidade total com Outlook, Gmail, Thunderbird e Webmail.
 */
export function compileToInlineHtml(options: CompileOptions): string {
  const { text, stationeryId, senderName, senderEmail, signature, insertedGifs = [], subject } = options;

  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin: 0 0 16px 0; line-height: 1.6; font-size: 14px;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const gifsHtml =
    insertedGifs.length > 0
      ? `<div style="margin: 20px 0; text-align: center;">
          ${insertedGifs
            .map(
              (url) =>
                `<img src="${url}" alt="Animação inserida" style="max-width: 280px; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin: 6px; display: inline-block;" />`
            )
            .join('')}
        </div>`
      : '';

  const signatureHtml = signature
    ? `<div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 13px; color: #64748b; line-height: 1.5;">
        ${signature.replace(/\n/g, '<br/>')}
      </div>`
    : '';

  // Configurações específicas de cada Papel de Carta (com CSS 100% Inline)
  switch (stationeryId) {
    case 'anectta-executive':
      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border-left: 6px solid #2563eb; overflow: hidden;">
    <tr>
      <td style="padding: 28px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px;">
          <tr>
            <td>
              <span style="font-size: 11px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.08em;">Comunicação Corporativa • Anectta</span>
              ${subject ? `<h2 style="margin: 6px 0 0 0; font-size: 18px; color: #0f172a; font-weight: 700;">${subject}</h2>` : ''}
            </td>
          </tr>
        </table>
        <div style="color: #334155;">
          ${paragraphs}
          ${gifsHtml}
        </div>
        ${signatureHtml}
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    case 'parchment-formal':
      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 24px; background-color: #faf7f2; font-family: Georgia, Cambria, 'Times New Roman', serif; color: #292524;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 650px; margin: 0 auto; background-color: #fdfbf7; border: 3px double #d97706; padding: 8px; border-radius: 4px;">
    <tr>
      <td style="padding: 32px 40px; border: 1px solid #fde68a;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 14px; font-weight: bold; color: #b45309; text-transform: uppercase; letter-spacing: 0.15em;">⚜ Notificação Oficial ⚜</span>
          <div style="width: 80px; height: 1px; background-color: #d97706; margin: 8px auto 0 auto;"></div>
        </div>
        <div style="color: #292524; font-size: 15px; line-height: 1.7;">
          ${paragraphs}
          ${gifsHtml}
        </div>
        ${signatureHtml}
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    case 'dark-cyber':
      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 24px; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; color: #e2e8f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 650px; margin: 0 auto; background-color: #0f172a; border: 1px solid #06b6d4; border-radius: 12px; box-shadow: 0 0 20px rgba(6, 182, 212, 0.15); overflow: hidden;">
    <tr>
      <td style="padding: 30px 36px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">
          <span style="font-size: 11px; font-family: monospace; color: #06b6d4; font-weight: bold;">[SECURE TRANSMISSION // TLS 1.3]</span>
        </div>
        <div style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
          ${paragraphs}
          ${gifsHtml}
        </div>
        ${signatureHtml}
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    case 'corporate-memo':
      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #cbd5e1; border-top: 6px solid #4f46e5; border-radius: 4px;">
    <tr>
      <td style="padding: 28px 36px;">
        <div style="font-size: 20px; font-weight: bold; color: #1e1b4b; letter-spacing: 0.05em; margin-bottom: 18px;">MEMORANDO INTERNO</div>
        <table role="presentation" width="100%" cellpadding="6" cellspacing="0" border="0" style="margin-bottom: 24px; background-color: #f1f5f9; border-radius: 6px; font-size: 12px;">
          <tr>
            <td width="20%" style="font-weight: bold; color: #475569;">DE:</td>
            <td style="color: #0f172a;">${senderName} &lt;${senderEmail}&gt;</td>
          </tr>
          ${subject ? `<tr><td style="font-weight: bold; color: #475569;">ASSUNTO:</td><td style="color: #0f172a;">${subject}</td></tr>` : ''}
          <tr>
            <td style="font-weight: bold; color: #475569;">DATA:</td>
            <td style="color: #0f172a;">${new Date().toLocaleDateString('pt-BR')}</td>
          </tr>
        </table>
        <div style="color: #334155; font-size: 14px; line-height: 1.6;">
          ${paragraphs}
          ${gifsHtml}
        </div>
        ${signatureHtml}
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    case 'festive-celebration':
      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 24px; background-color: #f0fdf4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #064e3b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 2px solid #10b981; border-radius: 16px; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.1); overflow: hidden;">
    <tr>
      <td style="padding: 32px 40px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="font-size: 20px;">✨ 🎄 🌟</span>
          <div style="font-size: 12px; font-weight: bold; color: #059669; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">Comemoração & Votos Executivos</div>
        </div>
        <div style="color: #1f2937; font-size: 14px; line-height: 1.6;">
          ${paragraphs}
          ${gifsHtml}
        </div>
        ${signatureHtml}
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    case 'clean':
    default:
      return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <div style="max-width: 620px; margin: 0 auto;">
    ${paragraphs}
    ${gifsHtml}
    ${signatureHtml}
  </div>
</body>
</html>`.trim();
  }
}
