/**
 * Horário silencioso, remetentes confiáveis e limpeza automática da Lixeira / Lixo eletrônico.
 */
import type { EmailItem } from '../types/email';

// ---------------------------------------------------------------- horário silencioso

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" (pode ser menor que o início: atravessa a meia-noite, ex.: 20:00 → 08:00) */
  end: string;
  /** Sábado e domingo inteiros em silêncio. */
  weekends: boolean;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: '20:00', end: '08:00', weekends: false };

const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return -1;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
};

/** Agora está dentro do horário silencioso? */
export function isQuietNow(cfg: QuietHours | undefined, now: Date = new Date()): boolean {
  if (!cfg?.enabled) return false;
  const day = now.getDay();
  if (cfg.weekends && (day === 0 || day === 6)) return true;
  const start = toMinutes(cfg.start);
  const end = toMinutes(cfg.end);
  if (start < 0 || end < 0 || start === end) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return start < end ? t >= start && t < end : t >= start || t < end;
}

// ---------------------------------------------------------------- remetentes confiáveis

/** Normaliza uma entrada da lista: "Ana <ana@x.com>" → "ana@x.com"; "x.com" → "@x.com". */
export function normalizeSenderEntry(raw: string): string {
  let v = (raw || '').trim().toLowerCase();
  const angle = v.match(/<([^>]+)>/);
  if (angle) v = angle[1].trim();
  if (!v) return '';
  if (!v.includes('@') && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) v = `@${v}`;
  return v;
}

/** O remetente está na lista (endereço exato, ou @domínio — que vale também para subdomínios)? */
export function senderInList(senderEmail: string | undefined, list: string[] | undefined): boolean {
  const s = (senderEmail || '').trim().toLowerCase();
  if (!s || !list || list.length === 0) return false;
  const host = s.split('@')[1] || '';
  return list.some((raw) => {
    const r = normalizeSenderEntry(raw);
    if (!r) return false;
    if (r.startsWith('@')) {
      const d = r.slice(1);
      return host === d || host.endsWith(`.${d}`);
    }
    return s === r;
  });
}

// ---------------------------------------------------------------- limpeza automática

/** Desde quando cada e-mail está na Lixeira ou no Lixo eletrônico (id → ms). */
export type PurgeClock = Record<string, number>;

const PURGE_FOLDERS = new Set(['trash', 'junk']);

/**
 * Atualiza o relógio: e-mails que acabaram de entrar na Lixeira/Lixo ganham "agora";
 * os que saíram de lá são esquecidos. Retorna o mesmo objeto se nada mudou.
 */
export function updatePurgeClock(clock: PurgeClock, emails: EmailItem[], now: number): PurgeClock {
  let changed = false;
  const next: PurgeClock = {};
  for (const e of emails) {
    if (!PURGE_FOLDERS.has(String(e.folder))) continue;
    if (clock[e.id] !== undefined) next[e.id] = clock[e.id];
    else {
      next[e.id] = now;
      changed = true;
    }
  }
  if (!changed && Object.keys(next).length === Object.keys(clock).length) return clock;
  return next;
}

/** E-mails que estão na Lixeira/Lixo há mais de `days` dias. */
export function expiredForPurge(clock: PurgeClock, emails: EmailItem[], days: number, now: number): string[] {
  const limit = days * 86_400_000;
  return emails
    .filter((e) => PURGE_FOLDERS.has(String(e.folder)) && clock[e.id] !== undefined && now - clock[e.id] >= limit)
    .map((e) => e.id);
}

const CLOCK_KEY = 'anectta_purge_clock_v1';

export function loadPurgeClock(): PurgeClock {
  try {
    const v = JSON.parse(localStorage.getItem(CLOCK_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function savePurgeClock(clock: PurgeClock): void {
  try {
    localStorage.setItem(CLOCK_KEY, JSON.stringify(clock));
  } catch {
    // sem armazenamento: a contagem recomeça na próxima abertura (mais seguro)
  }
}
