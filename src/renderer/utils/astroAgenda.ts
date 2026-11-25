/**
 * Astro — pendências da caixa, calculadas 100% no computador (sem IA externa):
 *
 *  - "Aguardando sua resposta": e-mails recebidos com pergunta/pedido para você que
 *    ainda não foram respondidos.
 *  - "Sem resposta": e-mails que você enviou com pergunta/pedido e que ninguém respondeu
 *    depois de alguns dias (follow-up).
 *
 * "Respondido" é reconhecido pelo cabeçalho de resposta (In-Reply-To / References) ou,
 * quando ele não existe, pelo mesmo assunto trocado com a mesma pessoa depois da mensagem.
 */
import type { EmailItem } from '../types/email';
import { buildInsights, firstNameOf } from './assistantInsights';
import { getEmailTimestampMs } from './dateSortUtils';

const DAY = 86_400_000;
/** Recebidos dos últimos N dias entram em "Aguardando sua resposta". */
export const NEEDS_REPLY_WINDOW_DAYS = 14;
/** Enviados sem resposta há pelo menos N dias entram em "Sem resposta". */
export const FOLLOW_UP_AFTER_DAYS = 3;
/** ... e no máximo N dias (depois disso, o assunto provavelmente já morreu). */
export const FOLLOW_UP_WINDOW_DAYS = 30;
const MAX_ITEMS = 50;

export interface AgendaItem {
  email: EmailItem;
  /** Dias desde a mensagem. */
  ageDays: number;
  /** Trecho com a pergunta/pedido detectado. */
  keyPoint: string;
}

export interface AstroAgenda {
  needsReply: AgendaItem[];
  awaitingAnswer: AgendaItem[];
}

const NOT_RECEIVED = new Set(['sent', 'drafts', 'outbox', 'trash', 'junk']);

export function normalizeSubject(subject: string): string {
  return (subject || '')
    .replace(/^\s*((re|res|resp|enc|fw|fwd|rv|tr)\s*(\[\d+\])?\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const normId = (id?: string) => (id || '').trim().replace(/^<|>$/g, '').toLowerCase();

/** Endereços de e-mail contidos em "Nome <a@x.com>, b@y.com". */
export function addressesIn(raw: string): string[] {
  return ((raw || '').match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map((a) => a.toLowerCase());
}

function referencedIds(e: EmailItem): string[] {
  return [normId(e.inReplyToHeader), ...(e.referencesHeader || []).map(normId)].filter(Boolean);
}

export interface AgendaOptions {
  myAddresses: string[];
  now?: Date;
  dismissed?: Set<string>;
  followUpAfterDays?: number;
}

export interface AgendaCandidate {
  email: EmailItem;
  ts: number;
  list: 'needsReply' | 'awaitingAnswer';
}

/** Remetentes automáticos (não esperam resposta). */
const AUTOMATED_SENDER_RE = /(no-?reply|nao-?responda|naoresponda|do-?not-?reply|mailer-daemon|postmaster|notifica[cç])/i;

/**
 * Fase 1 (rápida, só com o resumo dos e-mails): mensagens que PODEM entrar nas pendências —
 * recentes, de pessoas e ainda sem resposta. Só estas precisam ter o texto analisado.
 */
export function findAgendaCandidates(emails: EmailItem[], opts: AgendaOptions): AgendaCandidate[] {
  const now = (opts.now || new Date()).getTime();
  const mine = new Set(opts.myAddresses.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const dismissed = opts.dismissed || new Set<string>();
  const followUpAfter = Math.max(1, opts.followUpAfterDays ?? FOLLOW_UP_AFTER_DAYS);

  const withTs = emails.map((e) => ({ e, ts: getEmailTimestampMs(e) }));
  const sent = withTs.filter((x) => x.e.folder === 'sent');
  const received = withTs.filter((x) => !NOT_RECEIVED.has(x.e.folder));

  // Índices de respostas por cabeçalho
  const repliedByMe = new Set<string>();
  for (const s of sent) referencedIds(s.e).forEach((id) => repliedByMe.add(id));
  const answeredToMe = new Set<string>();
  for (const r of received) referencedIds(r.e).forEach((id) => answeredToMe.add(id));

  const sentMeta = sent.map((s) => ({
    ts: s.ts,
    subject: normalizeSubject(s.e.subject),
    to: new Set(addressesIn(s.e.recipient).filter((a) => !mine.has(a))),
  }));
  const receivedMeta = received.map((r) => ({
    ts: r.ts,
    subject: normalizeSubject(r.e.subject),
    from: (r.e.senderEmail || '').trim().toLowerCase(),
  }));

  const out: AgendaCandidate[] = [];

  // Aguardando sua resposta
  for (const { e, ts } of received) {
    if (dismissed.has(e.id) || ts > now || now - ts > NEEDS_REPLY_WINDOW_DAYS * DAY) continue;
    const from = (e.senderEmail || '').trim().toLowerCase();
    if (!from || mine.has(from) || AUTOMATED_SENDER_RE.test(from)) continue;
    const id = normId(e.messageIdHeader);
    if (id && repliedByMe.has(id)) continue;
    const subj = normalizeSubject(e.subject);
    if (sentMeta.some((s) => s.ts > ts && s.subject === subj && s.to.has(from))) continue;
    out.push({ email: e, ts, list: 'needsReply' });
  }

  // Sem resposta (você enviou e ninguém respondeu)
  for (const { e, ts } of sent) {
    const age = now - ts;
    if (dismissed.has(e.id) || age < followUpAfter * DAY || age > FOLLOW_UP_WINDOW_DAYS * DAY) continue;
    const to = new Set(addressesIn(e.recipient).filter((a) => !mine.has(a)));
    if (to.size === 0) continue;
    const id = normId(e.messageIdHeader);
    if (id && answeredToMe.has(id)) continue;
    const subj = normalizeSubject(e.subject);
    if (receivedMeta.some((r) => r.ts > ts && to.has(r.from) && r.subject === subj)) continue;
    // Você já mandou outra mensagem depois, no mesmo assunto, para as mesmas pessoas
    if (sentMeta.some((s) => s.ts > ts && s.subject === subj && [...to].some((a) => s.to.has(a)))) continue;
    out.push({ email: e, ts, list: 'awaitingAnswer' });
  }
  return out;
}

/** Fase 2: analisa o texto dos candidatos e monta as duas listas. */
export function computeAstroAgenda(emails: EmailItem[], opts: AgendaOptions): AstroAgenda {
  const now = (opts.now || new Date()).getTime();
  const needsReply: AgendaItem[] = [];
  const awaitingAnswer: AgendaItem[] = [];
  for (const c of findAgendaCandidates(emails, opts)) {
    const e = c.email;
    const insights = buildInsights({
      subject: e.subject,
      body: e.body,
      bodyHtml: e.bodyHtml,
      snippet: e.snippet,
      senderEmail: c.list === 'needsReply' ? e.senderEmail : undefined,
      dateStr: e.dateStr,
    });
    if (!insights.replyRequested || (c.list === 'needsReply' && insights.automated)) continue;
    const item = { email: e, ageDays: Math.floor((now - c.ts) / DAY), keyPoint: insights.keyPoint };
    (c.list === 'needsReply' ? needsReply : awaitingAnswer).push(item);
  }
  const byNewest = (a: AgendaItem, b: AgendaItem) => a.ageDays - b.ageDays;
  return {
    needsReply: needsReply.sort(byNewest).slice(0, MAX_ITEMS),
    awaitingAnswer: awaitingAnswer.sort(byNewest).slice(0, MAX_ITEMS),
  };
}

/** Texto educado para cobrar a resposta de um e-mail enviado. */
export function followUpText(recipientNameOrEmail: string): string {
  const name = firstNameOf(recipientNameOrEmail);
  const hello = name ? `Olá, ${name},` : 'Olá,';
  return `${hello}\n\nTudo bem? Retomando o e-mail abaixo: conseguiu ver? Fico no aguardo do seu retorno.\n\nObrigado!\n\n`;
}

export function ageLabel(days: number): string {
  if (days <= 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
}

// ---- Itens dispensados pelo usuário (não voltam a aparecer)
const DISMISSED_KEY = 'anectta_astro_dismissed_v1';

export function loadDismissed(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveDismissed(ids: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-1000)));
  } catch {
    // sem armazenamento: só não lembra entre sessões
  }
}
