/**
 * Criar compromisso escrevendo: "Reunião com Ana sexta 15h" → título, data e horário.
 * Usa o mesmo leitor de datas do Astro (dd/mm, "28 de novembro", hoje/amanhã, dias da semana,
 * 15h, 15h30, 15:30) e aceita duração ("por 2h", "por 30 min"). Tudo no computador.
 */
import { extractDates } from './assistantInsights';

export interface QuickEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  /** Ex.: "sex., 27/11 às 15h" */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const TIME_RE = /(?:\b(?:as|às)\s+)?\b([01]?\d|2[0-3])(?:\s?h(?:oras?|rs?|s)?(?![a-z])\s?([0-5]\d)?|:([0-5]\d))(?!\d)/i;
const DURATION_RE = /\bpor\s+(\d{1,2})\s*(h|hora|horas|min|minutos?)\b|\b(\d{1,2})\s*(h|hora|horas|min|minutos?)\s+de\s+dura[cç][aã]o\b/i;

/** Palavras de data/hora que saem do título. */
const DATE_WORDS =
  /(?<![\p{L}\d])(hoje|amanh[aã]|depois de amanh[aã]|(?:na |no |nesta |neste |pr[oó]xima |pr[oó]ximo )?(?:segunda|ter[cç]a|quarta|quinta|sexta)(?:-feira)?|(?:no |neste |pr[oó]ximo )?(?:s[aá]bado|domingo)|dia\s+\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+de\s+(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?)(?![\p{L}\d])/giu;

export function parseQuickEvent(text: string, now: Date = new Date()): QuickEvent | null {
  const raw = (text || '').trim();
  if (!raw) return null;

  const dates = extractDates(raw, now);
  const timeMatch = raw.match(TIME_RE);
  const time = timeMatch ? `${pad(Number(timeMatch[1]))}:${timeMatch[2] || timeMatch[3] || '00'}` : undefined;

  let date: string;
  let label: string;
  if (dates.length > 0) {
    date = dates[0].date;
    const t = dates[0].time || time;
    const [y, mo, d] = date.split('-').map(Number);
    const base = new Date(y, mo - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' });
    label = `${base}, ${pad(d)}/${pad(mo)}${t ? ` às ${t.endsWith(':00') ? `${Number(t.slice(0, 2))}h` : t.replace(':', 'h')}` : ''}`;
  } else if (time) {
    // Só horário: hoje, ou amanhã se o horário já passou
    const [h, m] = time.split(':').map(Number);
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const day = candidate.getTime() > now.getTime() ? candidate : new Date(candidate.getTime() + 86_400_000);
    date = ymd(day);
    label = `${day.getDate() === now.getDate() ? 'hoje' : 'amanhã'} às ${time.endsWith(':00') ? `${h}h` : time.replace(':', 'h')}`;
  } else {
    return null;
  }

  const startTime = (dates[0]?.time || time) as string | undefined;
  let endTime: string | undefined;
  if (startTime) {
    const dur = raw.match(DURATION_RE);
    let minutes = 60;
    if (dur) {
      const n = Number(dur[1] || dur[3]);
      const unit = (dur[2] || dur[4] || '').toLowerCase();
      minutes = unit.startsWith('h') ? n * 60 : n;
    }
    endTime = addMinutes(startTime, Math.max(15, minutes));
  }

  let title = raw
    .replace(DURATION_RE, ' ')
    .replace(DATE_WORDS, ' ')
    .replace(new RegExp(TIME_RE.source, 'gi'), ' ')
    .replace(/\s+(?:na|no|em|as|às|dia|de|a partir das?)\s*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;.-]+$/, '')
    .trim();
  // Preposições soltas no fim ("Reunião com Ana na" → "Reunião com Ana")
  title = title.replace(/\s+(?:na|no|em|as|às|dia|de)$/i, '').trim();
  if (!title) title = 'Compromisso';
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, date, allDay: !startTime, startTime, endTime, label };
}
