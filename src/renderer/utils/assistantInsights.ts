/**
 * Amoroso — Assistente Anectta: "Resumo rápido" de um e-mail, feito 100% no computador.
 *
 * Não é IA: extrai apenas fatos que dá para identificar com segurança no texto
 * (datas e horários, valores, anexos, códigos de verificação e pedidos de resposta)
 * e sugere o próximo passo. Nada é enviado para fora do computador.
 */

export type AssistantKind = 'meeting' | 'payment' | 'security' | 'delivery' | 'newsletter' | 'general';

export interface DateMention {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (quando o texto informa o horário) */
  time?: string;
  /** Ex.: "sex., 28/11 às 14h" */
  label: string;
  /** Aparece como prazo ("até", "vence", "prazo"...) */
  isDeadline: boolean;
}

export interface AssistantInsights {
  kind: AssistantKind;
  kindLabel: string;
  /** Frase principal do e-mail (trecho do próprio texto). */
  keyPoint: string;
  /** Datas a partir do dia do e-mail, na ordem em que aparecem (máx. 3). */
  dates: DateMention[];
  /** Valores em dinheiro (máx. 3). */
  amounts: string[];
  /** Nomes dos anexos reais (sem imagens de assinatura/embutidas). */
  attachments: string[];
  /** Código de verificação/segurança encontrado. */
  code?: string;
  /** Remetente pede resposta, confirmação ou aprovação. */
  replyRequested: boolean;
  /** Mensagem automática (no-reply) ou de divulgação. */
  automated: boolean;
  nextStep: string;
}

export interface InsightSource {
  subject?: string;
  body?: string;
  bodyHtml?: string;
  snippet?: string;
  senderEmail?: string;
  /** ISO — data do e-mail (base para "amanhã", "sexta"...). */
  dateStr?: string;
  attachments?: Array<{ name: string; isSignature?: boolean; isInline?: boolean }>;
  calendarInvite?: { date: string; startTime?: string; allDay?: boolean };
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};
const WEEKDAY_SHORT = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Tira os "espaços invisíveis" que e-mails de divulgação usam para encher a prévia
 * (&#8199;&#847;, &zwnj;, zero-width etc.): decodifica códigos numéricos e remove os invisíveis.
 */
export function cleanInvisible(text: string): string {
  return text
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_m, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});?/g, (_m, dec: string) => safeChar(parseInt(dec, 10)))
    .replace(/&(zwnj|zwj|shy|lrm|rlm);/gi, '')
    .replace(/&(ensp|emsp|thinsp|nbsp);/gi, ' ')
    .replace(/[­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁤⁪-⁯﻿ㅤﾠ]/g, '')
    .replace(/[  -   　]/g, ' ');
}
function safeChar(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Converte HTML em texto simples (sem scripts/estilos). */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(script|style)\b[\s\S]*$/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ');
}

// Seletor CSS curto (uma "palavra", sem espaços, ou lista separada por vírgulas): body, *, .x, a:hover, td.y
const CSS_SEL = String.raw`(?:\*|[#.]?[A-Za-z_][\w-]*(?:[.#:]{1,2}[\w-]+)*)`;
const CSS_RULE_RE = new RegExp(
  String.raw`${CSS_SEL}(?:\s*,\s*${CSS_SEL})*\s*\{\s*(?:[\w-]+\s*:[^{};]*;?\s*)+\}`,
  'g'
);

/**
 * Remove regras CSS que vazaram para o texto do e-mail (ex.: versão texto gerada a partir
 * do HTML sem tirar o <style>): "* { box-sizing: border-box; } body { font-family: Arial }".
 */
export function stripCss(text: string): string {
  if (!/\{[^{}]*:[^{}]*\}/.test(text)) return text;
  let t = text;
  for (let i = 0; i < 3; i++) {
    const next = t
      .replace(CSS_RULE_RE, ' ')
      .replace(/@[\w-]+[^{}]{0,200}\{\s*\}/g, ' ');
    if (next === t) break;
    t = next;
  }
  return t.replace(/[ \t]{2,}/g, ' ');
}

/** Remove o histórico citado ("Em ... escreveu:", "> ...", "-----Original Message-----"). */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (
      /^-{2,}\s*(original message|mensagem original|forwarded message|mensagem encaminhada)/i.test(line) ||
      /^(em|on)\s.{4,120}(escreveu|wrote)\s*:?$/i.test(line) ||
      /^(de|from)\s*:\s.+/i.test(line) && out.length > 2
    ) {
      break;
    }
    if (line.startsWith('>')) continue;
    out.push(raw);
  }
  return out.join('\n');
}

const parseTime = (s: string): string | undefined => {
  // 14h, 14h30, 14hs, 14 horas, 14:30 (o "h" não pode ser início de outra palavra: "2 hotéis")
  const m = s.match(/(?:^|[^\d])([01]?\d|2[0-3])(?:\s?h(?:oras?|rs?|s)?(?![a-z])\s?([0-5]\d)?|:([0-5]\d))(?!\d)/i);
  if (!m) return undefined;
  return `${pad(Number(m[1]))}:${m[2] || m[3] || '00'}`;
};

const fmtLabel = (d: Date, time?: string) => {
  const t = time ? ` às ${time.endsWith(':00') ? `${Number(time.slice(0, 2))}h` : time.replace(':', 'h')}` : '';
  return `${WEEKDAY_SHORT[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${t}`;
};

const DEADLINE_RE = /(ate|prazo|vence|vencimento|venc\.|limite|expira|validade|deadline|due)\s*(o dia|dia|em|:|de)?\s*$/i;

/** Encontra datas citadas no texto (dd/mm[/aaaa], "28 de novembro", hoje/amanhã, dias da semana). */
export function extractDates(text: string, ref: Date): DateMention[] {
  const found: Array<DateMention & { index: number }> = [];
  const norm = stripAccents(text);
  const refDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  const push = (index: number, length: number, d: Date) => {
    if (Number.isNaN(d.getTime())) return;
    const after = norm.slice(index + length, index + length + 28);
    const before = norm.slice(Math.max(0, index - 24), index);
    let time = parseTime(after.match(/^[^.\n]{0,28}/)?.[0] || '');
    if (!time) {
      const b = before.match(/(?:as|a partir das|das)\s+(\d{1,2}\s?(?:h|:)\s?\d{0,2})\s*(?:de|do|da|,)?\s*$/i);
      if (b) time = parseTime(b[1]);
    }
    const isDeadline = DEADLINE_RE.test(norm.slice(Math.max(0, index - 30), index).trimEnd());
    found.push({ index, date: ymd(d), time, label: fmtLabel(d, time), isDeadline });
  };

  // dd/mm ou dd/mm/aaaa (também com "-" ou ".")
  const numRe = /(?<![\d/.,-])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?![\d/.,-]*\d)/g;
  for (const m of norm.matchAll(numRe)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    // "1.5" ou "3-4" sem ano parecem números/intervalos, não datas
    if (!m[3] && m[0].includes('.') ) continue;
    if (!m[3] && m[0].includes('-')) continue;
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : ref.getFullYear();
    let d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) continue;
    if (!m[3] && d.getTime() < refDay.getTime() - 60 * 86400000) {
      year += 1;
      d = new Date(year, month - 1, day);
    }
    push(m.index ?? 0, m[0].length, d);
  }

  // "28 de novembro [de 2026]"
  const monthRe = /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/gi;
  for (const m of norm.matchAll(monthRe)) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].toLowerCase()];
    let year = m[3] ? Number(m[3]) : ref.getFullYear();
    let d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) continue;
    if (!m[3] && d.getTime() < refDay.getTime() - 60 * 86400000) {
      year += 1;
      d = new Date(year, month - 1, day);
    }
    push(m.index ?? 0, m[0].length, d);
  }

  // hoje / amanhã / depois de amanhã
  const relRe = /\b(depois de amanha|amanha|hoje)\b/gi;
  for (const m of norm.matchAll(relRe)) {
    const w = m[1].toLowerCase();
    const add = w === 'hoje' ? 0 : w === 'amanha' ? 1 : 2;
    push(m.index ?? 0, m[0].length, new Date(refDay.getTime() + add * 86400000));
  }

  // dias da semana: próxima ocorrência depois do dia do e-mail
  const wdRe = /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[-\s]feira)?\b/gi;
  for (const m of norm.matchAll(wdRe)) {
    const target = WEEKDAYS[m[1].toLowerCase()];
    let diff = (target - refDay.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    push(m.index ?? 0, m[0].length, new Date(refDay.getTime() + diff * 86400000));
  }

  // Só datas a partir do dia do e-mail; sem repetidas; na ordem do texto
  const seen = new Set<string>();
  return found
    .filter((d) => d.date >= ymd(refDay))
    .sort((a, b) => a.index - b.index)
    .filter((d) => {
      const key = `${d.date} ${d.time || ''}`;
      if (seen.has(key)) return false;
      // mesma data sem horário depois de uma com horário: ignora
      if (!d.time && [...seen].some((k) => k.startsWith(d.date))) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map(({ index: _i, ...rest }) => rest);
}

/** Valores em dinheiro: R$ 1.250,00 / US$ 30 / € 10,50. */
export function extractAmounts(text: string): string[] {
  const re = /(R\$|US\$|U\$|€|£)\s?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const v = `${m[1]} ${m[2].replace(/\s/g, '.')}`;
    if (!out.includes(v)) out.push(v);
    if (out.length >= 3) break;
  }
  return out;
}

/** Código de verificação (4 a 8 dígitos) próximo de "código"/"code"/"token". */
export function extractCode(text: string): string | undefined {
  const m = stripAccents(text).match(
    /\b(codigo|code|token|otp|pin)\b[^\d\n]{0,40}?\b(\d{4,8}|\d{3}[\s-]\d{3})\b/i
  );
  if (!m) return undefined;
  const code = m[2].replace(/[\s-]/g, '');
  // Evita anos e datas
  if (/^(19|20)\d{2}$/.test(code)) return undefined;
  return code;
}

const REQUEST_RES = [
  /aguardo (o )?(seu|sua|vosso|retorno|resposta|confirmacao|posicionamento)/,
  /aguardamos (o )?(seu|sua|retorno|resposta|confirmacao)/,
  /(por )?favor,? (confirm|respond|envi|verifiq|retorn|me avis|nos avis|aprov|assin|valid)/,
  /\b(pode|poderia|poderiam|consegue|conseguiria)(m)? (me |nos )?(enviar|confirmar|responder|verificar|retornar|avisar|aprovar|assinar|validar)/,
  /\b(solicito|solicitamos|peco que|preciso que|precisamos que)\b/,
  /\b(confirme|confirmem|responda|respondam|retorne|retornem|me avise|nos avise)\b/,
  /(aguardando|pendente de) (sua )?(aprovacao|assinatura|confirmacao|resposta)/,
  /\b(please (confirm|reply|respond|let me know|advise|send)|let me know|could you|can you)\b/,
];

const AUTOMATED_SENDER_RE = /(no-?reply|nao-?responda|naoresponda|do-?not-?reply|mailer-daemon|postmaster|notifica[cç])/i;

const isGreeting = (s: string) =>
  /^(ola|oi|ola,|prezad[oa]s?|caro|cara|car[oa]s|bom dia|boa tarde|boa noite|hi|hello|dear|hey)\b/i.test(stripAccents(s)) &&
  s.length < 60;
const isClosing = (s: string) =>
  /^(att|atenciosamente|abs|abracos?|obrigad[oa]|grato|grata|cordialmente|sds|saudacoes|best regards|regards|thanks|enviado do meu)/i.test(
    stripAccents(s)
  );

// Rótulos de rodapé/cabeçalho de newsletter que não dizem nada sobre o conteúdo
const BOILERPLATE_RE =
  /^(web version|view (it |this (e-?mail|message) )?(in|on) (your |a )?(web )?browser|vers[aã]o (web|online|para navegador)|(ver|visualizar|abrir) (este e-?mail |esta mensagem )?(no|na|em seu|pelo) navegador|clique aqui( para)?( ver)?|caso n[aã]o (esteja )?(consiga|visualizar))\b/i;

const sentencesOf = (text: string) =>
  text
    .split(/\n+|(?<=[.!?])\s+/)
    // Links não são "pontos-chave": saem da frase (e uma frase só de link é descartada)
    .map((s) =>
      s
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/\bwww\.\S+/gi, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim()
    )
    .filter(
      (s) =>
        s.length >= 12 &&
        !BOILERPLATE_RE.test(s) &&
        !/:\s*$/.test(s) && // rótulo sem conteúdo ("Web Version:")
        (s.match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length >= 3 // texto de verdade, não códigos
    );

const clip = (s: string, n = 170) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function buildInsights(src: InsightSource, now: Date = new Date()): AssistantInsights {
  const subject = (src.subject || '').trim();
  // Usa a versão texto; se ela vier "suja" (HTML ou CSS vazado do <style>), usa o HTML limpo.
  const body = src.body?.trim() ? src.body : '';
  const bodyIsDirty = /<\/?(html|body|div|p|table|span|br|style)\b/i.test(body) || stripCss(body) !== body;
  const htmlText = src.bodyHtml?.trim() ? htmlToText(src.bodyHtml) : '';
  const rawText = stripCss(
    body && !bodyIsDirty
      ? body
      : htmlText.trim()
      ? htmlText
      : body
      ? htmlToText(body)
      : src.snippet || ''
  );
  const text = cleanInvisible(stripQuoted(rawText)).slice(0, 12000);
  const plain = stripAccents(`${subject}\n${text}`).toLowerCase();

  const refParsed = src.dateStr ? new Date(src.dateStr) : now;
  const ref = Number.isNaN(refParsed.getTime()) ? now : refParsed;

  let dates = extractDates(`${subject}\n${text}`, ref);
  if (src.calendarInvite?.date) {
    const [y, mo, d] = src.calendarInvite.date.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    const time = src.calendarInvite.allDay ? undefined : src.calendarInvite.startTime;
    dates = [
      { date: src.calendarInvite.date, time, label: fmtLabel(dt, time), isDeadline: false },
      ...dates.filter((x) => x.date !== src.calendarInvite!.date),
    ].slice(0, 3);
  }
  const amounts = extractAmounts(text);
  const attachments = (src.attachments || [])
    .filter((a) => !a.isSignature && !a.isInline && a.name)
    .map((a) => a.name);

  const automatedSender = AUTOMATED_SENDER_RE.test(src.senderEmail || '');
  const newsletter = /(descadastr|cancelar (a )?inscri|unsubscribe|nao deseja mais receber|remover (seu )?e-?mail da lista|visualizar (no|em seu) navegador|view (it )?in (your )?browser)/.test(
    plain
  );

  let kind: AssistantKind = 'general';
  if (/(codigo de (verificacao|seguranca|acesso|confirmacao)|verification code|security code|alerta de seguranca|novo (acesso|login|dispositivo)|redefini[cr]\w* (de )?senha|autenticacao|confirmacao de seguranca|sign-?in|login)/.test(plain)) {
    kind = 'security';
  } else if (/(boleto|fatura|cobranca|vencimento|pagamento|nota fiscal|nf-?e|\bpix\b|invoice|segunda via|2a via)/.test(plain)) {
    kind = 'payment';
  } else if (src.calendarInvite || /(reuniao|meeting|videoconferencia|video ?chamada|\bcall\b|google meet|microsoft teams|zoom\.us|convite para)/.test(plain)) {
    kind = 'meeting';
  } else if (/(pedido|entrega|rastreio|rastreamento|encomenda|tracking|foi enviado|saiu para entrega)/.test(plain)) {
    kind = 'delivery';
  } else if (newsletter) {
    kind = 'newsletter';
  }
  const automated = automatedSender || newsletter;

  const KIND_LABELS: Record<AssistantKind, string> = {
    meeting: 'Reunião',
    payment: 'Cobrança / pagamento',
    security: 'Aviso de segurança',
    delivery: 'Pedido / entrega',
    newsletter: 'Divulgação',
    general: 'Mensagem',
  };

  const code = kind === 'security' ? extractCode(text) : undefined;

  const sentences = sentencesOf(text).filter((s) => !isGreeting(s) && !isClosing(s));
  const requestSentence = automated
    ? undefined
    : sentences.find((s) => {
        const n = stripAccents(s).toLowerCase();
        return REQUEST_RES.some((re) => re.test(n));
      });
  const questionSentence = automated ? undefined : sentences.find((s) => s.endsWith('?') && s.length < 220);
  const replyRequested = Boolean(requestSentence || questionSentence);

  const keyPoint = clip(
    requestSentence ||
      sentences.find((s) => !/^(de|from|para|to|enviado|sent|assunto|subject)\s*:/i.test(s)) ||
      subject ||
      'Mensagem sem texto.'
  );

  const deadline = dates.find((d) => d.isDeadline);
  const firstDate = dates[0];
  let nextStep: string;
  if (kind === 'security' && code) {
    nextStep = 'Use o código só se foi você quem pediu. Nunca o repasse a ninguém.';
  } else if (kind === 'security') {
    nextStep = 'Se não reconhece este acesso, troque sua senha.';
  } else if (kind === 'payment' && (deadline || firstDate)) {
    nextStep = `Pagar até ${(deadline || firstDate)!.label}${amounts[0] ? ` (${amounts[0]})` : ''}.`;
  } else if (kind === 'meeting' && firstDate) {
    nextStep = `Confirmar presença: ${firstDate.label}.`;
  } else if (replyRequested) {
    nextStep = requestSentence ? 'Responder ao remetente: há um pedido no e-mail.' : 'Responder: há uma pergunta no e-mail.';
  } else if (deadline) {
    nextStep = `Atenção ao prazo: ${deadline.label}.`;
  } else if (automated) {
    nextStep = 'Mensagem automática: não precisa responder.';
  } else {
    nextStep = 'Nenhuma ação necessária.';
  }

  return {
    kind,
    kindLabel: KIND_LABELS[kind],
    keyPoint,
    dates,
    amounts,
    attachments,
    code,
    replyRequested,
    automated,
    nextStep,
  };
}

/** Primeiro nome para a saudação ("Olá Maria,"). */
export function firstNameOf(sender: string): string {
  const clean = (sender || '').replace(/["'<>]/g, '').trim();
  if (clean && !clean.includes('@')) {
    const first = clean.split(/\s+/)[0];
    if (/^[\p{L}-]{2,}$/u.test(first)) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return '';
}

export function quickReplyText(kind: 'confirm' | 'thanks', sender: string): string {
  const name = firstNameOf(sender);
  const hello = name ? `Olá, ${name},` : 'Olá,';
  return kind === 'confirm'
    ? `${hello}\n\nConfirmo o recebimento do seu e-mail. Obrigado!\n\n`
    : `${hello}\n\nMuito obrigado pelo retorno!\n\n`;
}
