import { describe, it, expect } from 'vitest';
import { buildIcsRsvpReply, getRsvpLabel } from '../src/renderer/utils/icsRsvpUtils';

describe('icsRsvpUtils (RFC 5546 Calendar RSVP)', () => {
  it('gera payload ICS METHOD:REPLY válido com PARTSTAT=ACCEPTED', () => {
    const ics = buildIcsRsvpReply({
      invite: {
        uid: 'meeting-42@corp.com',
        summary: 'Comitê Executivo; Q4, Revisão',
        date: '2026-11-30',
        startTime: '14:30',
        endTime: '15:30',
        location: 'Sala A',
        organizerEmail: 'ceo@corp.com',
        organizerName: 'CEO',
      },
      attendeeEmail: 'gestor@anectta.com',
      attendeeName: 'Gestor Anectta',
      status: 'ACCEPTED',
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REPLY');
    expect(ics).toContain('UID:meeting-42@corp.com');
    expect(ics).toContain('DTSTART:20261130T143000');
    expect(ics).toContain('DTEND:20261130T153000');
    expect(ics).toContain('SUMMARY:Comitê Executivo\\; Q4\\, Revisão');
    expect(ics).toContain('ATTENDEE;CN="Gestor Anectta";PARTSTAT=ACCEPTED:mailto:gestor@anectta.com');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('suporta eventos de dia inteiro (VALUE=DATE) e rótulos em português', () => {
    const ics = buildIcsRsvpReply({
      invite: {
        uid: 'allday-1@corp.com',
        summary: 'Convenção Anual',
        date: '2026-12-10',
        endDate: '2026-12-11',
        startTime: '00:00',
        endTime: '23:59',
        allDay: true,
      },
      attendeeEmail: 'eu@anectta.com',
      status: 'TENTATIVE',
    });

    expect(ics).toContain('DTSTART;VALUE=DATE:20261210');
    expect(ics).toContain('DTEND;VALUE=DATE:20261211');
    expect(ics).toContain('PARTSTAT=TENTATIVE');
    expect(getRsvpLabel('ACCEPTED')).toBe('Aceito');
    expect(getRsvpLabel('TENTATIVE')).toBe('Talvez');
    expect(getRsvpLabel('DECLINED')).toBe('Recusado');
  });
});
