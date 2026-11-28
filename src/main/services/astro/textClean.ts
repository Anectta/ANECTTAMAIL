/**
 * Astro Respostas Inteligentes — limpeza de texto de e-mails.
 *
 * Isola o que a pessoa realmente escreveu: sem HTML, sem o histórico citado da conversa,
 * sem assinatura / avisos legais / "Enviado do meu iPhone". Funções puras (texto → texto).
 */
import { cleanInvisible, htmlToText, stripCss } from '../../../renderer/utils/assistantInsights';

/** Marcadores em HTML a partir dos quais começa a citação da conversa anterior. */
const HTML_QUOTE_MARKERS: RegExp[] = [
  /<div[^>]*class=["'][^"']*\bgmail_quote\b/i,
  /<div[^>]*class=["'][^"']*\bgmail_attr\b/i,
  /<blockquote\b/i,
  /<div[^>]*id=["']?(divRplyFwdMsg|appendonsend|mail-editor-reference-message-container)\b/i,
  /<div[^>]*class=["'][^"']*\b(moz-cite-prefix|yahoo_quoted|protonmail_quote|zmail_extra)\b/i,
  /<hr[^>]*id=["']?stopSpelling/i,
];

/** Converte HTML em texto e já corta a citação anterior (corte pelo primeiro marcador). */
export function htmlToPlain(html: string): string {
  let h = html || '';
  let cut = h.length;
  for (const re of HTML_QUOTE_MARKERS) {
    const m = re.exec(h);
    if (m && m.index < cut) cut = m.index;
  }
  h = h.slice(0, cut);
  const text = htmlToText(h.replace(/<\/(td|th)>/gi, ' '));
  return normalizeWhitespace(cleanInvisible(stripCss(text)));
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const REPLY_HEADER_ONE_LINE =
  /^(em|on|el|le|am|il)\b.{2,200}\b(escreveu|wrote|escribió|escribio|a écrit|schrieb|ha scritto)\s*:?\s*$/i;
const REPLY_HEADER_START = /^(em|on|el|le|am|il)\s.+/i;
const REPLY_HEADER_END = /\b(escreveu|wrote|escribió|escribio|a écrit|schrieb|ha scritto)\s*:?\s*$/i;
const SEPARATOR_LINES = [
  /^-{2,}\s*(original message|mensagem original|mensaje original|forwarded message|mensagem encaminhada|mensaje reenviado)\s*-*$/i,
  /^_{10,}$/,
  /^-{10,}$/,
  /^(begin forwarded message|início da mensagem encaminhada)\s*:?$/i,
];
const OUTLOOK_FROM = /^\*?(de|from|von|da)\s*:\*?\s+.+/i;
const OUTLOOK_NEXT = /^\*?(enviado|enviada|sent|date|data|gesendet|fecha|para|to|assunto|subject)(\s+em)?\s*:/i;

/** Remove o histórico citado (texto puro): "> ...", "Em ... escreveu:", cabeçalhos do Outlook. */
export function stripQuotedText(text: string): string {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (SEPARATOR_LINES.some((re) => re.test(line))) break;
    if (REPLY_HEADER_ONE_LINE.test(line)) break;
    // Cabeçalho "Em ..., Fulano" + quebra + "<email> escreveu:"
    if (REPLY_HEADER_START.test(line) && i + 1 < lines.length && REPLY_HEADER_END.test(lines[i + 1].trim())) break;
    // Bloco de cabeçalho do Outlook: "De: ..." seguido de "Enviado/Sent/Para/Assunto: ..."
    if (OUTLOOK_FROM.test(line)) {
      const next = lines.slice(i + 1, i + 4).map((l) => l.trim());
      if (next.some((l) => OUTLOOK_NEXT.test(l))) break;
    }
    if (line.startsWith('>')) continue;
    out.push(lines[i]);
  }
  return out.join('\n');
}

const MOBILE_FOOTERS =
  /^(enviado|enviada) (do|de|pelo|a partir do) (meu )?(iphone|ipad|android|samsung|celular|smartphone|outlook|galaxy|dispositivo)|^sent from (my )?(iphone|ipad|android|samsung|mobile|outlook|galaxy)|^(obter|get) (o )?outlook (para|for)|^enviado (do|pelo) (yahoo|gmail)/i;
const LEGAL_START =
  /^(esta mensagem|este e-?mail|this (e-?mail|message)|aviso legal|aviso de confidencialidade|confidencialidade|confidential|disclaimer|antes de imprimir|pense no meio ambiente|please consider the environment)/i;

/**
 * Remove assinatura: corta no delimitador "-- ", tira "Enviado do meu iPhone" e avisos legais
 * no final, e linhas conhecidas da assinatura do usuário (quando informadas).
 */
export function stripSignature(text: string, knownSignatureLines: string[] = []): string {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '--' || lines[i] === '-- ' || t === '—') {
      end = i;
      break;
    }
  }
  let kept = lines.slice(0, end).filter((l) => !MOBILE_FOOTERS.test(l.trim()));
  // Aviso legal: só se começar na parte final do texto (para não cortar um e-mail que fala do assunto)
  const legalIdx = kept.findIndex((l, i) => i >= Math.floor(kept.length * 0.5) && LEGAL_START.test(l.trim()));
  if (legalIdx > 0) kept = kept.slice(0, legalIdx);
  // Assinatura conhecida do usuário: remove essas linhas do final do texto
  if (knownSignatureLines.length > 0) {
    const known = new Set(knownSignatureLines.map(normalizeLineKey));
    while (kept.length > 0) {
      const last = kept[kept.length - 1].trim();
      if (!last || known.has(normalizeLineKey(last))) kept.pop();
      else break;
    }
  }
  return kept.join('\n').trim();
}

/** Chave de comparação de linha (sem acento, minúscula, sem pontuação final). */
export function normalizeLineKey(line: string): string {
  return line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s.,;:!|\-–—_]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto puro do e-mail: HTML (se houver) ou texto, sem citação nem assinatura. */
export function cleanEmailText(input: { body?: string; bodyHtml?: string }, knownSignatureLines: string[] = []): string {
  const hasText = (input.body || '').trim().length > 0;
  const looksHtml = /<\/?(html|body|div|p|table|span|br)\b/i.test(input.body || '');
  const base =
    (input.bodyHtml || '').trim() && (!hasText || looksHtml)
      ? htmlToPlain(input.bodyHtml || input.body || '')
      : normalizeWhitespace(cleanInvisible(stripCss(input.body || '')));
  return normalizeWhitespace(stripSignature(stripQuotedText(base), knownSignatureLines));
}

export const GREETING_RE =
  /^(ol[áa]|oie|oi|bom dia|boa tarde|boa noite|prezad[oa]s?|car[oa]s?|estimad[oa]s?|sra\.?|sr\.?|senhora|senhor|hello|hi|hey|dear|good (morning|afternoon|evening)|hola|buen[oa]s? (d[ií]as|tardes|noches))(?![a-zà-ÿ])/i;
const CLOSING_PHRASE_RE =
  /^(um abra[çc]o|grande abra[çc]o|forte abra[çc]o|abra[çc]os?|abs|att|atenciosamente|cordialmente|sauda[çc][õo]es|muito obrigad[oa]|obrigad[oa]s?|grat[oa]|agrade[çc]o|at[ée] (mais|logo|breve)|bjs|beijos?|valeu|kind regards|best regards|regards|best|thanks|thank you|cheers|saludos|un abrazo)(?![a-zà-ÿ])/i;

/**
 * A linha é uma despedida? ("Abraço,", "Att.", "Abraços, João", "Obrigado pela atenção!")
 * Depois da despedida só pode vir um nome com inicial maiúscula — "Obrigado pelo retorno, vou
 * verificar" é conteúdo, não despedida.
 */
export function isClosingLine(line: string): boolean {
  const l = (line || '').trim();
  if (!l || l.length > 60) return false;
  const m = l.match(CLOSING_PHRASE_RE);
  if (!m) return false;
  const rest = l
    .slice(m[0].length)
    .replace(/^[\s,]*(pela|pelo|por)\s+(sua\s+|a\s+)?(aten[çc][ãa]o|ajuda|retorno|contato|compreens[ãa]o|colabora[çc][ãa]o|paci[êe]ncia|parceria)/i, '')
    .replace(/^[\s,]*(desde j[áa]|antecipadamente)/i, '');
  return /^[\s,.!;:-]*([A-ZÀ-Ý][a-zà-ÿ.]*(\s+[A-ZÀ-Ý][a-zà-ÿ.]*)?)?[\s.!]*$/.test(rest);
}

export interface SplitMessage {
  greeting?: string;
  body: string;
  closing?: string;
  /** Linhas após a despedida (normalmente o nome de quem assina). */
  signoff: string[];
}

/** Separa saudação, corpo e despedida (+ nome) de um texto já limpo. */
export function splitGreetingAndClosing(text: string): SplitMessage {
  const lines = (text || '').split('\n').map((l) => l.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();

  let greeting: string | undefined;
  if (lines.length > 1 && lines[0].length <= 60 && GREETING_RE.test(lines[0])) {
    greeting = lines.shift();
  }

  let closing: string | undefined;
  let signoff: string[] = [];
  // Procura a despedida nas últimas 6 linhas; o que vem depois (curto) é o nome/cargo
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
    const l = lines[i];
    if (isClosingLine(l)) {
      const after = lines.slice(i + 1).filter(Boolean);
      if (after.every((a) => a.length <= 60)) {
        closing = l;
        signoff = after;
        lines.splice(i);
      }
      break;
    }
  }
  return { greeting, body: lines.join('\n').trim(), closing, signoff };
}
