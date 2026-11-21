import { describe, it, expect, vi, afterEach } from 'vitest';
import { CloudSyncService } from '../src/main/services/cloudSyncService';

describe('CloudSyncService (Google / Microsoft / CalDAV / CardDAV)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sincroniza eventos do Google Calendar API v3', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'g123',
              summary: 'Reunião de Produto',
              location: 'Google Meet',
              start: { dateTime: '2026-11-25T14:00:00-03:00' },
              end: { dateTime: '2026-11-25T15:00:00-03:00' },
              organizer: { displayName: 'Ana', email: 'ana@empresa.com' },
            },
          ],
        }),
      })
    );

    const res = await CloudSyncService.syncCalendar({
      provider: 'google',
      accessToken: 'fake-token',
      sourceLabel: 'Google',
    });

    expect(res.success).toBe(true);
    expect(res.events).toHaveLength(1);
    expect(res.events![0].id).toBe('google-g123');
    expect(res.events![0].title).toBe('Reunião de Produto');
    expect(res.events![0].date).toBe('2026-11-25');
  });

  it('sincroniza e parseia VEVENT de resposta XML CalDAV (REPORT)', async () => {
    const mockXml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:propstat>
      <d:prop>
        <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:caldav-uid-1
SUMMARY:Sprint Review Nextcloud
DTSTART:20261128T100000Z
DTEND:20261128T113000Z
LOCATION:Sala 2
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 207,
        text: async () => mockXml,
      })
    );

    const res = await CloudSyncService.syncCalendar({
      provider: 'caldav',
      caldavUrl: 'https://cloud.exemplo.com/remote.php/dav/calendars/user/personal/',
      username: 'user',
      password: 'secret',
      sourceLabel: 'Nextcloud',
    });

    expect(res.success).toBe(true);
    expect(res.events).toHaveLength(1);
    expect(res.events![0].title).toBe('Sprint Review Nextcloud');
    expect(res.events![0].location).toBe('Sala 2');
  });

  it('sincroniza e parseia contatos vCard de resposta CardDAV', async () => {
    const mockCardXml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:propstat>
      <d:prop>
        <card:address-data>BEGIN:VCARD
VERSION:3.0
FN:Carlos Silva
EMAIL:carlos@cliente.com.br
ORG:Cliente S/A
TEL:+55 11 99999-0000
END:VCARD</card:address-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 207,
        text: async () => mockCardXml,
      })
    );

    const res = await CloudSyncService.syncContacts({
      provider: 'carddav',
      carddavUrl: 'https://cloud.exemplo.com/remote.php/dav/addressbooks/users/user/contacts/',
      username: 'user',
      password: 'secret',
      sourceLabel: 'Nextcloud',
    });

    expect(res.success).toBe(true);
    expect(res.contacts).toHaveLength(1);
    expect(res.contacts![0].name).toBe('Carlos Silva');
    expect(res.contacts![0].email).toBe('carlos@cliente.com.br');
    expect(res.contacts![0].company).toBe('Cliente S/A');
  });

  it('atualiza e exclui evento no Google Calendar (V2)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const upd = await CloudSyncService.updateCalendarEvent({
      provider: 'google',
      accessToken: 'tok',
      remoteId: 'google-abc999',
      event: {
        id: 'google-abc999',
        title: 'Reunião Atualizada',
        date: '2026-12-01',
        startTime: '10:00',
        endTime: '11:00',
      },
    });
    expect(upd.success).toBe(true);

    const del = await CloudSyncService.deleteCalendarEvent({
      provider: 'google',
      accessToken: 'tok',
      remoteId: 'google-abc999',
    });
    expect(del.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
