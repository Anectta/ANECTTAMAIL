/**
 * Astro — sugestões de limpeza, calculadas no computador (sem IA externa).
 *
 * Remetentes que mandam vários e-mails para a Caixa de Entrada e você nunca abre
 * (ex.: 15 e-mails de uma loja nos últimos 30 dias, nenhum aberto). O Astro só SUGERE:
 * arquivar, cancelar a inscrição ou criar uma regra — nada é feito sem confirmação.
 */
import type { EmailItem } from '../types/email';
import { addressesIn } from './astroAgenda';
import { getEmailTimestampMs } from './dateSortUtils';

const DAY = 86_400_000;
export const CLEANUP_WINDOW_DAYS = 30;
export const CLEANUP_MIN_EMAILS = 5;
const MAX_SUGGESTIONS = 20;

export interface CleanupSuggestion {
  senderEmail: string;
  senderName: string;
  /** E-mails recebidos na janela. */
  count: number;
  /** Quantos desses foram abertos (0, ou 1 tolerado — ex.: aberto sem querer ao selecionar). */
  opened: number;
  /** Todos os e-mails desse remetente na Caixa de Entrada (os que seriam arquivados). */
  inboxIds: string[];
  /** E-mail mais recente (usado para cancelar a inscrição). */
  latest: EmailItem;
  /** Há link de descadastro no cabeçalho do e-mail. */
  canUnsubscribe: boolean;
}

export function computeCleanupSuggestions(
  emails: EmailItem[],
  opts: { myAddresses: string[]; now?: Date; keptSenders?: Set<string>; minEmails?: number; windowDays?: number }
): CleanupSuggestion[] {
  const now = (opts.now || new Date()).getTime();
  const windowMs = (opts.windowDays ?? CLEANUP_WINDOW_DAYS) * DAY;
  const minEmails = opts.minEmails ?? CLEANUP_MIN_EMAILS;
  const mine = new Set(opts.myAddresses.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const kept = opts.keptSenders || new Set<string>();

  // Pessoas para quem você já escreveu: são contatos de verdade, nunca entram na limpeza.
  const contacted = new Set<string>();
  for (const e of emails) {
    if (e.folder === 'sent') addressesIn(`${e.recipient || ''},${e.cc || ''}`).forEach((a) => contacted.add(a));
  }

  type Group = { name: string; inWindow: number; openedInWindow: number; inboxIds: string[]; latest: EmailItem; latestTs: number; unsub: boolean };
  const groups = new Map<string, Group>();
  for (const e of emails) {
    if (e.folder !== 'inbox') continue;
    const from = (e.senderEmail || '').trim().toLowerCase();
    if (!from || mine.has(from) || contacted.has(from) || kept.has(from)) continue;
    const ts = getEmailTimestampMs(e);
    let g = groups.get(from);
    if (!g) {
      g = { name: e.sender || from, inWindow: 0, openedInWindow: 0, inboxIds: [], latest: e, latestTs: ts, unsub: false };
      groups.set(from, g);
    }
    g.inboxIds.push(e.id);
    if (ts > g.latestTs) {
      g.latest = e;
      g.latestTs = ts;
      g.name = e.sender || g.name;
    }
    if (e.listUnsubscribe) g.unsub = true;
    if (now - ts <= windowMs && ts <= now) {
      g.inWindow += 1;
      if (e.isRead) g.openedInWindow += 1;
    }
  }

  const out: CleanupSuggestion[] = [];
  for (const [senderEmail, g] of groups) {
    // Tolera 1 abertura quando o remetente manda bastante (o app às vezes seleciona e marca como lido sozinho).
    const allowedOpened = g.inWindow > minEmails ? 1 : 0;
    if (g.inWindow < minEmails || g.openedInWindow > allowedOpened) continue;
    out.push({
      senderEmail,
      senderName: g.name,
      count: g.inWindow,
      opened: g.openedInWindow,
      inboxIds: g.inboxIds,
      latest: g.latest,
      canUnsubscribe: g.unsub,
    });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, MAX_SUGGESTIONS);
}

// ---- Remetentes que o usuário escolheu manter (não voltam a ser sugeridos)
const KEPT_KEY = 'anectta_astro_cleanup_kept_v1';

export function loadKeptSenders(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(KEPT_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.map((s) => String(s).toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

export function saveKeptSenders(senders: Set<string>): void {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify([...senders].slice(-1000)));
  } catch {
    // sem armazenamento: só não lembra entre sessões
  }
}
