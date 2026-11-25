/**
 * Astro — Resumo do dia: o que precisa de atenção hoje, calculado no computador.
 *  - prazos e valores a pagar (próximos 7 dias e vencidos há até 3 dias);
 *  - reuniões de hoje e amanhã;
 *  - e-mails não lidos de contatos VIP;
 *  - newsletters não lidas acumuladas.
 * (Pendências de resposta e follow-ups vêm de astroAgenda.)
 */
import type { EmailItem } from '../types/email';
import { buildInsights } from './assistantInsights';
import { getEmailTimestampMs } from './dateSortUtils';
import { classifyEmailTriage } from './triageAndTemplates';

const DAY = 86_400_000;
const WINDOW_DAYS = 21;
const MAX_ITEMS = 8;

/** E-mail que provavelmente fala de pagamento ou reunião (o texto completo é lido só desses). */
export const DAILY_HINT_RE =
  /(boleto|fatura|cobran|vencimento|vence|pagamento|pagar|nota fiscal|nf-?e|\bpix\b|invoice|reuni|meeting|convite|agenda|\bcall\b|webinar|videoconfer)/i;

export interface DailyItem {
  email: EmailItem;
  /** Ex.: "sex., 05/12" ou "sex., 27/11 às 14h" */
  label: string;
  /** YYYY-MM-DD */
  date: string;
  amount?: string;
  overdue?: boolean;
}

export interface DailyDigest {
  payments: DailyItem[];
  meetings: DailyItem[];
  vipUnread: EmailItem[];
  newslettersUnread: number;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function isDailyCandidate(e: EmailItem, now: number): boolean {
  if (e.folder !== 'inbox') return false;
  const ts = getEmailTimestampMs(e);
  if (now - ts > WINDOW_DAYS * DAY || ts > now) return false;
  return Boolean(e.calendarInvite) || DAILY_HINT_RE.test(`${e.subject || ''} ${e.snippet || ''}`);
}

export function computeDailyDigest(emails: EmailItem[], opts: { now?: Date; vips?: Set<string> }): DailyDigest {
  const nowDate = opts.now || new Date();
  const now = nowDate.getTime();
  const today = ymd(nowDate);
  const tomorrow = ymd(new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1));
  const in7 = ymd(new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 7));
  const back3 = ymd(new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 3));

  const payments: DailyItem[] = [];
  const meetings: DailyItem[] = [];
  const vipUnread: EmailItem[] = [];
  let newslettersUnread = 0;

  for (const e of emails) {
    if (e.folder !== 'inbox') continue;
    if (!e.isRead) {
      const from = (e.senderEmail || '').trim().toLowerCase();
      if (opts.vips?.has(from)) vipUnread.push(e);
      else if (classifyEmailTriage(e) === 'newsletters') newslettersUnread += 1;
    }
    if (!isDailyCandidate(e, now)) continue;
    const ins = buildInsights(
      {
        subject: e.subject,
        body: e.body,
        bodyHtml: e.bodyHtml,
        snippet: e.snippet,
        senderEmail: e.senderEmail,
        dateStr: e.dateStr,
        calendarInvite: e.calendarInvite as any,
      },
      nowDate
    );
    if (ins.kind === 'payment') {
      const d = ins.dates.find((x) => x.isDeadline) || ins.dates[0];
      if (!d) continue;
      if (d.date >= back3 && d.date <= in7) {
        payments.push({ email: e, label: d.label, date: d.date, amount: ins.amounts[0], overdue: d.date < today });
      }
    } else if (ins.kind === 'meeting') {
      const d = ins.dates[0];
      if (d && (d.date === today || d.date === tomorrow)) meetings.push({ email: e, label: d.label, date: d.date });
    }
  }

  const byDate = (a: DailyItem, b: DailyItem) => a.date.localeCompare(b.date);
  return {
    payments: payments.sort(byDate).slice(0, MAX_ITEMS),
    meetings: meetings.sort(byDate).slice(0, MAX_ITEMS),
    vipUnread: vipUnread.slice(0, MAX_ITEMS),
    newslettersUnread,
  };
}

// ---- Mostrar automaticamente uma vez por dia
const SHOWN_KEY = 'anectta_astro_daily_shown_v1';

export function dailyShownToday(now = new Date()): boolean {
  try {
    return localStorage.getItem(SHOWN_KEY) === ymd(now);
  } catch {
    return false;
  }
}

export function markDailyShown(now = new Date()): void {
  try {
    localStorage.setItem(SHOWN_KEY, ymd(now));
  } catch {
    // ignore
  }
}
