export type RecurrencePreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

export interface RecurrenceRule {
  preset: RecurrencePreset;
  interval?: number;
  unit?: 'day' | 'week' | 'month' | 'year';
  until?: string; // YYYY-MM-DD
}

export type CalendarColorKey = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose';

export interface CalendarCategory {
  id: string;
  name: string;
  color: CalendarColorKey;
  isDefault?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  allDay?: boolean;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  organizer: string;
  participants?: string[];
  location: string;
  badge: string;
  calendarId?: string;
  color?: CalendarColorKey;
  recurrence?: RecurrenceRule;
  reminderMinutes?: number | null;
  description?: string;
  meetingUrl?: string;
}

export interface ExpandedCalendarOccurrence {
  event: CalendarEvent;
  occurrenceDate: string; // YYYY-MM-DD
  isRecurringInstance: boolean;
}

export const CALENDAR_CATEGORIES: CalendarCategory[] = [
  { id: 'default', name: 'Meu Calendário', color: 'blue', isDefault: true },
  { id: 'work', name: 'Reuniões & Projetos', color: 'emerald' },
  { id: 'personal', name: 'Pessoal', color: 'violet' },
  { id: 'deadlines', name: 'Prazos & Entregas', color: 'amber' },
];

export const COLOR_STYLES: Record<
  CalendarColorKey,
  { dot: string; pill: string; block: string; border: string }
> = {
  blue: {
    dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    block: 'bg-blue-50/95 text-blue-900 border-l-4 border-l-blue-600 border-blue-200',
    border: 'border-blue-500',
  },
  emerald: {
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    block: 'bg-emerald-50/95 text-emerald-900 border-l-4 border-l-emerald-600 border-emerald-200',
    border: 'border-emerald-500',
  },
  violet: {
    dot: 'bg-violet-500',
    pill: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
    block: 'bg-violet-50/95 text-violet-900 border-l-4 border-l-violet-600 border-violet-200',
    border: 'border-violet-500',
  },
  amber: {
    dot: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    block: 'bg-amber-50/95 text-amber-900 border-l-4 border-l-amber-500 border-amber-200',
    border: 'border-amber-500',
  },
  rose: {
    dot: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
    block: 'bg-rose-50/95 text-rose-900 border-l-4 border-l-rose-600 border-rose-200',
    border: 'border-rose-500',
  },
};

export function getEventColor(ev: CalendarEvent): CalendarColorKey {
  if (ev.color && COLOR_STYLES[ev.color]) return ev.color;
  const cat = CALENDAR_CATEGORIES.find((c) => c.id === ev.calendarId);
  return cat?.color || 'blue';
}

export function getTodayIso(): string {
  const now = new Date();
  return formatIsoDate(now);
}

export function getTomorrowIso(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return formatIsoDate(now);
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return formatIsoDate(d);
}

export function addMonthsIso(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, maxDay));
  return formatIsoDate(d);
}

export function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function addMinutesToTime(hhmm: string, minutesToAdd: number): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr || '9', 10);
  const m = parseInt(mStr || '0', 10);
  const total = (h * 60 + m + minutesToAdd) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function formatTimeDisplay(hhmm: string, use24Hour: boolean): string {
  if (use24Hour) return hhmm;
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr || '0', 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr || '00'} ${suffix}`;
}

export function getIsoWeekNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return 1;
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getMonthGridDates(
  year: number,
  monthZeroIndexed: number,
  weekStartsOn: 'sunday' | 'monday' | 'saturday'
): string[] {
  const firstOfMonth = new Date(year, monthZeroIndexed, 1);
  const firstDayOfWeek = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const startDayNum = weekStartsOn === 'monday' ? 1 : weekStartsOn === 'saturday' ? 6 : 0;
  const offset = (firstDayOfWeek - startDayNum + 7) % 7;

  const startDate = new Date(year, monthZeroIndexed, 1 - offset);
  const dates: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(formatIsoDate(d));
  }
  return dates;
}

export function getWeekDates(
  anchorIso: string,
  weekStartsOn: 'sunday' | 'monday' | 'saturday'
): string[] {
  const anchor = parseIsoDate(anchorIso);
  const day = anchor.getDay();
  const startDayNum = weekStartsOn === 'monday' ? 1 : weekStartsOn === 'saturday' ? 6 : 0;
  const offset = (day - startDayNum + 7) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - offset);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(formatIsoDate(d));
  }
  return dates;
}

export function getRecurrenceLabel(rule?: RecurrenceRule): string {
  if (!rule || rule.preset === 'none') return 'Não se repete';
  switch (rule.preset) {
    case 'daily':
      return 'Todos os dias';
    case 'weekdays':
      return 'Dias úteis (Seg–Sex)';
    case 'weekly':
      return 'Toda semana';
    case 'biweekly':
      return 'A cada 2 semanas';
    case 'monthly':
      return 'Todos os meses';
    case 'yearly':
      return 'Todos os anos';
    case 'custom': {
      const interval = Math.max(1, rule.interval || 1);
      const unitMap = {
        day: interval === 1 ? 'dia' : 'dias',
        week: interval === 1 ? 'semana' : 'semanas',
        month: interval === 1 ? 'mês' : 'meses',
        year: interval === 1 ? 'ano' : 'anos',
      };
      return `A cada ${interval} ${unitMap[rule.unit || 'week']}`;
    }
    default:
      return 'Não se repete';
  }
}

function advanceOccurrence(iso: string, rule: RecurrenceRule): string {
  switch (rule.preset) {
    case 'daily':
      return addDaysIso(iso, 1);
    case 'weekdays': {
      let next = addDaysIso(iso, 1);
      let guard = 0;
      while (guard < 7) {
        const dow = parseIsoDate(next).getDay();
        if (dow !== 0 && dow !== 6) return next;
        next = addDaysIso(next, 1);
        guard++;
      }
      return next;
    }
    case 'weekly':
      return addDaysIso(iso, 7);
    case 'biweekly':
      return addDaysIso(iso, 14);
    case 'monthly':
      return addMonthsIso(iso, 1);
    case 'yearly':
      return addMonthsIso(iso, 12);
    case 'custom': {
      const interval = Math.max(1, rule.interval || 1);
      const unit = rule.unit || 'week';
      if (unit === 'day') return addDaysIso(iso, interval);
      if (unit === 'week') return addDaysIso(iso, interval * 7);
      if (unit === 'month') return addMonthsIso(iso, interval);
      return addMonthsIso(iso, interval * 12);
    }
    default:
      return addDaysIso(iso, 1);
  }
}

export function expandEventsForRange(
  events: CalendarEvent[],
  rangeStartIso: string,
  rangeEndIso: string
): ExpandedCalendarOccurrence[] {
  const occurrences: ExpandedCalendarOccurrence[] = [];

  for (const ev of events) {
    const startIso = ev.date;
    const endIso = ev.endDate && ev.endDate >= startIso ? ev.endDate : startIso;
    const rule = ev.recurrence;

    if (!rule || rule.preset === 'none') {
      // Multi-day or single-day non-recurring event
      let cursor = startIso < rangeStartIso ? rangeStartIso : startIso;
      const limit = endIso > rangeEndIso ? rangeEndIso : endIso;
      let guard = 0;
      while (cursor <= limit && guard < 180) {
        occurrences.push({
          event: ev,
          occurrenceDate: cursor,
          isRecurringInstance: false,
        });
        cursor = addDaysIso(cursor, 1);
        guard++;
      }
      continue;
    }

    // Recurring event
    const effectiveEnd =
      rule.until && rule.until < rangeEndIso ? rule.until : rangeEndIso;
    let cursor = startIso;
    let guard = 0;

    // Fast-forward if cursor is years behind rangeStartIso for daily/weekly
    while (cursor <= effectiveEnd && guard < 500) {
      if (cursor >= rangeStartIso) {
        occurrences.push({
          event: ev,
          occurrenceDate: cursor,
          isRecurringInstance: cursor !== startIso,
        });
      }
      const next = advanceOccurrence(cursor, rule);
      if (next <= cursor) break;
      cursor = next;
      guard++;
    }
  }

  return occurrences.sort((a, b) => {
    const ka = `${a.occurrenceDate} ${a.event.allDay ? '00:00' : a.event.startTime}`;
    const kb = `${b.occurrenceDate} ${b.event.allDay ? '00:00' : b.event.startTime}`;
    return ka.localeCompare(kb);
  });
}

function parseIcsDateTime(raw: string): { date: string; time: string; allDay: boolean } {
  const clean = raw.trim().replace(/^.*:/, '');
  const isDateOnly = /^\d{8}$/.test(clean);
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!match) {
    return { date: getTodayIso(), time: '09:00', allDay: false };
  }
  const [, y, m, d, hh = '09', mm = '00'] = match;
  return {
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}`,
    allDay: isDateOnly,
  };
}

export function parseIcsContent(icsText: string): CalendarEvent[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const parsed: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {
        id: `ics-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        badge: 'Importado (.ics)',
        organizer: 'Calendário Externo',
        location: 'Não informado',
        startTime: '09:00',
        endTime: '10:00',
        date: getTodayIso(),
        calendarId: 'default',
        color: 'blue',
        participants: [],
      };
    } else if (trimmed === 'END:VEVENT' && current) {
      if (current.title) {
        parsed.push(current as CalendarEvent);
      }
      current = null;
    } else if (current) {
      if (trimmed.startsWith('SUMMARY')) {
        current.title = trimmed.replace(/^SUMMARY[^:]*:/, '').replace(/\\n/g, ' ').trim();
      } else if (trimmed.startsWith('DTSTART')) {
        const dt = parseIcsDateTime(trimmed);
        current.date = dt.date;
        current.startTime = dt.time;
        if (dt.allDay) current.allDay = true;
      } else if (trimmed.startsWith('DTEND')) {
        const dt = parseIcsDateTime(trimmed);
        current.endTime = dt.time;
        if (!dt.allDay) {
          current.endDate = dt.date;
        }
      } else if (trimmed.startsWith('LOCATION')) {
        current.location = trimmed.replace(/^LOCATION[^:]*:/, '').trim() || 'Não informado';
      } else if (trimmed.startsWith('DESCRIPTION')) {
        current.description = trimmed.replace(/^DESCRIPTION[^:]*:/, '').replace(/\\n/g, '\n').trim();
      } else if (trimmed.startsWith('ORGANIZER')) {
        const org = trimmed.replace(/^ORGANIZER[^:]*:/, '').replace(/^mailto:/i, '').trim();
        current.organizer = org || 'Calendário Externo';
      } else if (trimmed.startsWith('ATTENDEE')) {
        const email = trimmed.replace(/^ATTENDEE[^:]*:/, '').replace(/^mailto:/i, '').trim();
        if (email) {
          current.participants = [...(current.participants || []), email];
        }
      } else if (trimmed.startsWith('URL')) {
        current.meetingUrl = trimmed.replace(/^URL[^:]*:/, '').trim();
      }
    }
  }

  return parsed;
}

export function buildIcsExport(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Anectta MAIL//Calendario//PT-BR',
    'CALSCALE:GREGORIAN',
  ];

  for (const ev of events) {
    const dateCompact = ev.date.replace(/-/g, '');
    const endDateCompact = (ev.endDate || ev.date).replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@anectta.mail`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      lines.push(`DTEND;VALUE=DATE:${endDateCompact}`);
    } else {
      const startCompact = `${ev.startTime.replace(':', '')}00`;
      const endCompact = `${ev.endTime.replace(':', '')}00`;
      lines.push(`DTSTART:${dateCompact}T${startCompact}`);
      lines.push(`DTEND:${endDateCompact}T${endCompact}`);
    }
    lines.push(`SUMMARY:${ev.title.replace(/\r?\n/g, ' ')}`);
    if (ev.description) lines.push(`DESCRIPTION:${ev.description.replace(/\r?\n/g, '\\n')}`);
    if (ev.location) lines.push(`LOCATION:${ev.location.replace(/\r?\n/g, ' ')}`);
    if (ev.organizer) lines.push(`ORGANIZER:${ev.organizer.replace(/\r?\n/g, ' ')}`);
    for (const p of ev.participants || []) {
      lines.push(`ATTENDEE:mailto:${p}`);
    }
    if (ev.meetingUrl) lines.push(`URL:${ev.meetingUrl}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
