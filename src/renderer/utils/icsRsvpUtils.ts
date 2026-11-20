import { CalendarInviteInfo } from '@/types/email';
import { CalendarEvent } from './calendarUtils';

const EVENTS_STORAGE_KEY = 'anectta_mail_calendar_events_v1';

export type RsvpStatus = 'ACCEPTED' | 'TENTATIVE' | 'DECLINED';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUtcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function toIcsLocalDateTime(dateIso: string, timeHm: string, allDay?: boolean): string {
  const cleanDate = dateIso.replace(/-/g, '');
  if (allDay) return cleanDate;
  const [h, m] = (timeHm || '09:00').split(':');
  return `${cleanDate}T${pad2(Number(h) || 0)}${pad2(Number(m) || 0)}00`;
}

function escapeIcsText(val?: string): string {
  return String(val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Gera um arquivo .ics RFC 5546 com METHOD:REPLY para responder convites de reunião.
 */
export function buildIcsRsvpReply(params: {
  invite: CalendarInviteInfo;
  attendeeEmail: string;
  attendeeName?: string;
  status: RsvpStatus;
}): string {
  const { invite, attendeeEmail, attendeeName, status } = params;
  const dtStamp = formatUtcStamp(new Date());
  const dtStart = toIcsLocalDateTime(invite.date, invite.startTime, invite.allDay);
  const dtEnd = toIcsLocalDateTime(invite.endDate || invite.date, invite.endTime, invite.allDay);
  const safeName = (attendeeName || attendeeEmail).replace(/[";:,]/g, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Anectta MAIL//Calendar RSVP//PT-BR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${invite.uid || `anectta-rsvp-${Date.now()}@anectta.local`}`,
    `DTSTAMP:${dtStamp}`,
    invite.allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    invite.allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(invite.summary || 'Reunião')}`,
    invite.location ? `LOCATION:${escapeIcsText(invite.location)}` : '',
    invite.organizerEmail
      ? `ORGANIZER${invite.organizerName ? `;CN="${invite.organizerName.replace(/"/g, '')}"` : ''}:mailto:${invite.organizerEmail}`
      : '',
    `ATTENDEE;CN="${safeName}";PARTSTAT=${status}:mailto:${attendeeEmail}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

/**
 * Salva ou remove o convite no calendário local do Anectta MAIL e notifica a UI.
 */
export function syncInviteToLocalCalendar(
  invite: CalendarInviteInfo,
  status: RsvpStatus
): void {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    const existing: CalendarEvent[] = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(existing) ? existing : [];
    const eventId = `rsvp-${invite.uid || `${invite.date}-${invite.startTime}`}`;

    if (status === 'DECLINED') {
      const filtered = safeList.filter((ev) => ev.id !== eventId);
      localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(filtered));
      window.dispatchEvent(new Event('anectta:calendar-updated'));
      return;
    }

    const newEvent: CalendarEvent = {
      id: eventId,
      title: invite.summary || 'Reunião',
      date: invite.date,
      endDate: invite.endDate || invite.date,
      allDay: Boolean(invite.allDay),
      startTime: invite.startTime || '09:00',
      endTime: invite.endTime || '10:00',
      organizer: invite.organizerName || invite.organizerEmail || 'Organizador',
      location: invite.location || '',
      badge: status === 'ACCEPTED' ? 'Confirmado' : 'Talvez',
      calendarId: 'work',
      color: status === 'ACCEPTED' ? 'emerald' : 'amber',
      reminderMinutes: 15,
      description: invite.description,
      meetingUrl: invite.meetingUrl,
    };

    const next = [newEvent, ...safeList.filter((ev) => ev.id !== eventId)];
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('anectta:calendar-updated'));
  } catch {
    // ignore storage errors
  }
}

export function getRsvpLabel(status: RsvpStatus): string {
  if (status === 'ACCEPTED') return 'Aceito';
  if (status === 'TENTATIVE') return 'Talvez';
  return 'Recusado';
}
