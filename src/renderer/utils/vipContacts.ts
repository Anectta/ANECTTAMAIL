/**
 * Contatos VIP — pessoas importantes cujos e-mails vão para o topo dos Prioritários.
 *
 * O Astro sugere VIPs com base em quem você mais troca mensagens (calculado no computador):
 * conta os e-mails que VOCÊ enviou para a pessoa e os que ela mandou para você, só quando a
 * conversa é de mão dupla (você também escreve para ela).
 */
import type { EmailItem } from '../types/email';
import { addressesIn } from './astroAgenda';
import { getEmailTimestampMs } from './dateSortUtils';

const DAY = 86_400_000;
export const VIP_WINDOW_DAYS = 90;
const MAX_SUGGESTIONS = 5;

export interface VipSuggestion {
  email: string;
  name: string;
  sentByMe: number;
  receivedFromThem: number;
}

const AUTOMATED = /(no-?reply|nao-?responda|naoresponda|do-?not-?reply|mailer-daemon|postmaster|notifica|newsletter|news@|marketing@)/i;

export function computeVipSuggestions(
  emails: EmailItem[],
  opts: { myAddresses: string[]; vips: Set<string>; dismissed: Set<string>; now?: Date }
): VipSuggestion[] {
  const now = (opts.now || new Date()).getTime();
  const mine = new Set(opts.myAddresses.map((a) => a.toLowerCase()));
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  const names = new Map<string, string>();

  for (const e of emails) {
    const ts = getEmailTimestampMs(e);
    if (now - ts > VIP_WINDOW_DAYS * DAY || ts > now) continue;
    if (e.folder === 'sent') {
      for (const a of addressesIn(`${e.recipient || ''},${e.cc || ''}`)) {
        if (mine.has(a)) continue;
        sent.set(a, (sent.get(a) || 0) + 1);
        const m = (e.recipient || '').match(new RegExp(`"?([^"<,;]+?)"?\\s*<${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>`, 'i'));
        if (m && !names.has(a)) names.set(a, m[1].trim());
      }
    } else if (e.folder !== 'junk' && e.folder !== 'trash' && e.folder !== 'drafts') {
      const from = (e.senderEmail || '').trim().toLowerCase();
      if (!from || mine.has(from)) continue;
      received.set(from, (received.get(from) || 0) + 1);
      if (e.sender && e.sender !== e.senderEmail) names.set(from, e.sender);
    }
  }

  const out: VipSuggestion[] = [];
  for (const [email, s] of sent) {
    const r = received.get(email) || 0;
    // Conversa de verdade: você escreveu pelo menos 3 vezes e a pessoa respondeu pelo menos 2
    if (s < 3 || r < 2) continue;
    if (opts.vips.has(email) || opts.dismissed.has(email) || AUTOMATED.test(email)) continue;
    out.push({ email, name: names.get(email) || email, sentByMe: s, receivedFromThem: r });
  }
  return out
    .sort((a, b) => b.sentByMe * 2 + b.receivedFromThem - (a.sentByMe * 2 + a.receivedFromThem))
    .slice(0, MAX_SUGGESTIONS);
}

// ---------------------------------------------------------------- armazenamento

const VIP_KEY = 'anectta_vip_contacts_v1';
const DISMISSED_KEY = 'anectta_vip_dismissed_v1';
export const VIP_EVENT = 'anectta:vip-changed';

const loadSet = (key: string): Set<string> => {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(list) ? list.map((s) => String(s).toLowerCase()) : []);
  } catch {
    return new Set();
  }
};
const saveSet = (key: string, set: Set<string>) => {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // sem armazenamento
  }
};

export const loadVips = () => loadSet(VIP_KEY);
export const loadVipDismissed = () => loadSet(DISMISSED_KEY);

export function saveVips(set: Set<string>): void {
  saveSet(VIP_KEY, set);
  try {
    window.dispatchEvent(new Event(VIP_EVENT));
  } catch {
    // fora do navegador
  }
}

export const saveVipDismissed = (set: Set<string>) => saveSet(DISMISSED_KEY, set);
