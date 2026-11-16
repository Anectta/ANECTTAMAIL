import { EmailItem } from '@/types/email';

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

/**
 * Converte qualquer representação de data/hora de um EmailItem
 * em um timestamp em milissegundos para ordenação cronológica precisa.
 */
export function getEmailTimestampMs(email: EmailItem): number {
  // 1. Prioridade máxima: dateStr em formato ISO (e.g. 2026-11-12T14:18:22.000Z)
  if (email.dateStr) {
    const t = new Date(email.dateStr).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  const rawTimestamp = (email.timestamp || '').trim();

  // 2. Formato hora do dia "HH:mm" (e.g. "11:18", "07:18", "01:22")
  const timeMatch = rawTimestamp.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);

    if (email.period === 'yesterday') {
      d.setDate(d.getDate() - 1);
    } else if (email.period === 'last_week') {
      d.setDate(d.getDate() - 5);
    } else if (email.period === 'older') {
      d.setDate(d.getDate() - 30);
    }
    return d.getTime();
  }

  // 3. Formato com data curta (e.g. "qui 05/11", "05/11", "12/11")
  const slashMatch = rawTimestamp.match(/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const now = new Date();
    return new Date(now.getFullYear(), month, day, 12, 0, 0, 0).getTime();
  }

  // 4. Formato com dia e mês textual (e.g. "12 nov", "05 out")
  const textMonthMatch = rawTimestamp.toLowerCase().match(/(\d{1,2})\s+(?:de\s+)?([a-z]{3})/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthStr = textMonthMatch[2];
    const month = MONTH_MAP[monthStr] ?? 0;
    const now = new Date();
    return new Date(now.getFullYear(), month, day, 12, 0, 0, 0).getTime();
  }

  // 5. Fallback baseado no período do e-mail
  const now = Date.now();
  if (email.period === 'today') return now;
  if (email.period === 'yesterday') return now - 86400000;
  if (email.period === 'last_week') return now - 86400000 * 5;
  return now - 86400000 * 30;
}


/**
 * Rótulo de recebimento sempre com hora: "07:46", "Ontem 14:33", "13 nov. 09:12".
 */
export function formatReceivedLabel(email: EmailItem): string {
  const fallback = email.timestamp || '';
  if (!email.dateStr) return fallback;
  const d = new Date(email.dateStr);
  if (isNaN(d.getTime())) return fallback;
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const ms = d.getTime();
  if (ms >= todayStart) return time;
  if (ms >= todayStart - DAY) return `Ontem ${time}`;
  const date = d
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) })
    .replace(/ de /g, ' ');
  return `${date} ${time}`;
}
