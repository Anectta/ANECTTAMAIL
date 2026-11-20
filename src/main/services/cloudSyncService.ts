export interface CloudCalendarEventDTO {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  allDay?: boolean;
  startTime: string;
  endTime: string;
  organizer: string;
  participants?: string[];
  location: string;
  badge: string;
  calendarId?: string;
  color?: 'blue' | 'emerald' | 'violet' | 'amber' | 'rose';
  reminderMinutes?: number | null;
  description?: string;
  meetingUrl?: string;
}

export interface CloudContactDTO {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  groups?: string[];
}

export interface CloudSyncCalendarRequest {
  provider: 'google' | 'microsoft' | 'caldav';
  accessToken?: string;
  caldavUrl?: string;
  username?: string;
  password?: string;
  sourceLabel?: string;
}

export interface CloudSyncContactsRequest {
  provider: 'google' | 'microsoft' | 'carddav';
  accessToken?: string;
  carddavUrl?: string;
  username?: string;
  password?: string;
  sourceLabel?: string;
}

export interface CloudPushEventRequest {
  provider: 'google' | 'microsoft' | 'caldav';
  accessToken?: string;
  caldavUrl?: string;
  username?: string;
  password?: string;
  event: CloudCalendarEventDTO;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function unescapeDavText(val: string): string {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIsoOrDateOnly(raw?: string): { date: string; time: string; allDay: boolean } {
  if (!raw) {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
      time: '09:00',
      allDay: false,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return { date: raw.trim(), time: '00:00', allDay: true };
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return { date: raw.slice(0, 10), time: '09:00', allDay: false };
  }
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    allDay: false,
  };
}

function parseIcsDateTime(raw: string): { date: string; time: string; allDay: boolean } | null {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (!hh || !mm) return { date: `${y}-${mo}-${d}`, time: '00:00', allDay: true };
  if (z) {
    const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss || '0')));
    return {
      date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
      time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
      allDay: false,
    };
  }
  return { date: `${y}-${mo}-${d}`, time: `${hh}:${mm}`, allDay: false };
}

function parseIcsEventsFromText(icsText: string, sourceLabel: string): CloudCalendarEventDTO[] {
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || [];
  const events: CloudCalendarEventDTO[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let uid = '';
    let summary = '';
    let location = '';
    let description = '';
    let organizer = sourceLabel;
    let start: { date: string; time: string; allDay: boolean } | null = null;
    let end: { date: string; time: string; allDay: boolean } | null = null;

    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const rawKey = line.slice(0, idx);
      const baseKey = rawKey.toUpperCase().split(';')[0];
      const val = line.slice(idx + 1).trim();

      if (baseKey === 'UID') uid = val;
      else if (baseKey === 'SUMMARY') summary = unescapeDavText(val);
      else if (baseKey === 'LOCATION') location = unescapeDavText(val);
      else if (baseKey === 'DESCRIPTION') description = unescapeDavText(val);
      else if (baseKey === 'DTSTART') start = parseIcsDateTime(val);
      else if (baseKey === 'DTEND') end = parseIcsDateTime(val);
      else if (baseKey === 'ORGANIZER') {
        const cn = rawKey.match(/CN=(?:"([^"]+)"|([^;:]+))/i);
        organizer = (cn?.[1] || cn?.[2] || val.replace(/^mailto:/i, '')).trim() || sourceLabel;
      }
    }

    if (!start) continue;
    const linkMatch = `${location}\n${description}`.match(
      /(https?:\/\/(?:meet\.google\.com|teams\.microsoft\.com|[\w-]*\.?zoom\.us|meet\.jit\.si)[^\s<>"']+)/i
    );

    events.push({
      id: `caldav-${uid || `${start.date}-${i}`}`,
      title: summary || '(Sem título)',
      date: start.date,
      endDate: end?.date || start.date,
      allDay: start.allDay,
      startTime: start.time,
      endTime: end?.time || start.time,
      organizer,
      location,
      badge: sourceLabel,
      calendarId: 'work',
      color: 'violet',
      reminderMinutes: 15,
      description: description ? description.slice(0, 800) : undefined,
      meetingUrl: linkMatch ? linkMatch[1] : undefined,
    });
  }

  return events;
}

function parseVCardBlocks(vcfText: string, defaultGroup: string): CloudContactDTO[] {
  const unfolded = vcfText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) || [];
  const contacts: CloudContactDTO[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let fn = '';
    let nField = '';
    let email = '';
    let phone = '';
    let company = '';
    let role = '';
    const groups: string[] = [defaultGroup];

    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const baseKey = line.slice(0, idx).toUpperCase().split(';')[0].replace(/^ITEM\d+\./, '');
      const val = line.slice(idx + 1).trim();
      if (!val) continue;

      if (baseKey === 'FN' && !fn) fn = unescapeDavText(val);
      else if (baseKey === 'N' && !nField) {
        const parts = val.split(';').map(unescapeDavText).filter(Boolean);
        nField = parts.length >= 2 ? `${parts[1]} ${parts[0]}`.trim() : parts[0] || '';
      } else if (baseKey === 'EMAIL' && !email) {
        const clean = val.replace(/^mailto:/i, '').trim().toLowerCase();
        if (clean.includes('@')) email = clean;
      } else if (baseKey === 'TEL' && !phone) phone = unescapeDavText(val);
      else if (baseKey === 'ORG' && !company) company = unescapeDavText(val.split(';')[0]);
      else if (baseKey === 'TITLE' && !role) role = unescapeDavText(val);
      else if (baseKey === 'CATEGORIES') {
        for (const cat of val.split(',')) {
          const c = unescapeDavText(cat);
          if (c && !groups.includes(c)) groups.push(c);
        }
      }
    }

    if (!email) continue;
    contacts.push({
      name: fn || nField || email.split('@')[0],
      email,
      phone: phone || undefined,
      company: company || undefined,
      role: role || undefined,
      groups,
    });
  }

  return contacts;
}

function basicAuthHeader(username?: string, password?: string): string {
  const token = Buffer.from(`${username || ''}:${password || ''}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

export class CloudSyncService {
  /**
   * Testa conexão com um servidor CalDAV ou CardDAV usando PROPFIND (Depth 0).
   */
  public static async testDavConnection(params: {
    url: string;
    username: string;
    password: string;
  }): Promise<{ success: boolean; message: string }> {
    const cleanUrl = (params.url || '').trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
      return { success: false, message: 'Informe uma URL HTTP/HTTPS válida para o servidor DAV.' };
    }
    try {
      const res = await fetch(cleanUrl, {
        method: 'PROPFIND',
        headers: {
          Authorization: basicAuthHeader(params.username, params.password),
          Depth: '0',
          'Content-Type': 'application/xml; charset=utf-8',
        },
        body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
      });
      if (res.status === 207 || (res.status >= 200 && res.status < 300)) {
        return { success: true, message: `Conexão DAV verificada com sucesso (HTTP ${res.status}).` };
      }
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: 'Autenticação recusada (HTTP 401/403). Verifique usuário e senha de aplicativo.' };
      }
      return { success: false, message: `Servidor respondeu com HTTP ${res.status}. Verifique a URL da coleção DAV.` };
    } catch (err: any) {
      return { success: false, message: `Falha de rede ao conectar no servidor DAV: ${err?.message || err}` };
    }
  }

  /**
   * Sincroniza eventos do Google Calendar, Microsoft Graph ou CalDAV.
   */
  public static async syncCalendar(
    req: CloudSyncCalendarRequest
  ): Promise<{ success: boolean; events?: CloudCalendarEventDTO[]; error?: string }> {
    try {
      if (req.provider === 'google') {
        if (!req.accessToken) {
          return { success: false, error: 'Token OAuth2 do Google ausente. Reconecte a conta Google.' };
        }
        const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${req.accessToken}` },
        });
        const data: any = await res.json();
        if (!res.ok) {
          return {
            success: false,
            error: data?.error?.message || `Google Calendar retornou HTTP ${res.status}.`,
          };
        }

        const events: CloudCalendarEventDTO[] = (data.items || []).map((ev: any) => {
          const start = parseIsoOrDateOnly(ev.start?.dateTime || ev.start?.date);
          const end = parseIsoOrDateOnly(ev.end?.dateTime || ev.end?.date);
          return {
            id: `google-${ev.id}`,
            title: ev.summary || '(Sem título)',
            date: start.date,
            endDate: end.date,
            allDay: start.allDay,
            startTime: start.time,
            endTime: end.time,
            organizer: ev.organizer?.displayName || ev.organizer?.email || 'Google Calendar',
            participants: Array.isArray(ev.attendees)
              ? ev.attendees.map((a: any) => a.email).filter(Boolean)
              : undefined,
            location: ev.location || '',
            badge: req.sourceLabel || 'Google Calendar',
            calendarId: 'work',
            color: 'blue',
            reminderMinutes: 15,
            description: ev.description ? String(ev.description).slice(0, 800) : undefined,
            meetingUrl: ev.hangoutLink || undefined,
          };
        });
        return { success: true, events };
      }

      if (req.provider === 'microsoft') {
        if (!req.accessToken) {
          return { success: false, error: 'Token OAuth2 da Microsoft ausente. Reconecte a conta Microsoft 365.' };
        }
        const url =
          'https://graph.microsoft.com/v1.0/me/events?$top=200&$select=id,subject,start,end,isAllDay,location,organizer,bodyPreview,onlineMeeting,attendees';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${req.accessToken}` },
        });
        const data: any = await res.json();
        if (!res.ok) {
          return {
            success: false,
            error: data?.error?.message || `Microsoft Graph retornou HTTP ${res.status}.`,
          };
        }

        const events: CloudCalendarEventDTO[] = (data.value || []).map((ev: any) => {
          const start = parseIsoOrDateOnly(ev.start?.dateTime);
          const end = parseIsoOrDateOnly(ev.end?.dateTime);
          return {
            id: `m365-${ev.id}`,
            title: ev.subject || '(Sem título)',
            date: start.date,
            endDate: end.date,
            allDay: Boolean(ev.isAllDay),
            startTime: start.time,
            endTime: end.time,
            organizer:
              ev.organizer?.emailAddress?.name ||
              ev.organizer?.emailAddress?.address ||
              'Microsoft 365',
            participants: Array.isArray(ev.attendees)
              ? ev.attendees.map((a: any) => a?.emailAddress?.address).filter(Boolean)
              : undefined,
            location: ev.location?.displayName || '',
            badge: req.sourceLabel || 'Microsoft 365',
            calendarId: 'work',
            color: 'emerald',
            reminderMinutes: 15,
            description: ev.bodyPreview ? String(ev.bodyPreview).slice(0, 800) : undefined,
            meetingUrl: ev.onlineMeeting?.joinUrl || undefined,
          };
        });
        return { success: true, events };
      }

      // CalDAV (RFC 4791)
      const caldavUrl = (req.caldavUrl || '').trim();
      if (!caldavUrl) {
        return { success: false, error: 'URL CalDAV não configurada.' };
      }
      const queryXml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT" />
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

      const res = await fetch(caldavUrl, {
        method: 'REPORT',
        headers: {
          Authorization: basicAuthHeader(req.username, req.password),
          Depth: '1',
          'Content-Type': 'application/xml; charset=utf-8',
        },
        body: queryXml,
      });

      const xmlText = await res.text();
      if (res.status !== 207 && !(res.status >= 200 && res.status < 300)) {
        return { success: false, error: `CalDAV retornou HTTP ${res.status}. Verifique URL e credenciais.` };
      }

      const calDataMatches = [...xmlText.matchAll(/<(?:\w+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/gi)];
      const allEvents: CloudCalendarEventDTO[] = [];
      for (const m of calDataMatches) {
        const icsContent = decodeXmlEntities(m[1] || '');
        allEvents.push(...parseIcsEventsFromText(icsContent, req.sourceLabel || 'CalDAV'));
      }
      return { success: true, events: allEvents };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao sincronizar calendário na nuvem.' };
    }
  }

  /**
   * Publica um evento criado no Anectta MAIL para Google Calendar, Microsoft Graph ou CalDAV.
   */
  public static async pushCalendarEvent(
    req: CloudPushEventRequest
  ): Promise<{ success: boolean; remoteId?: string; error?: string }> {
    const ev = req.event;
    try {
      if (req.provider === 'google') {
        if (!req.accessToken) return { success: false, error: 'Token OAuth2 do Google ausente.' };
        const startObj = ev.allDay
          ? { date: ev.date }
          : { dateTime: `${ev.date}T${ev.startTime || '09:00'}:00` };
        const endObj = ev.allDay
          ? { date: ev.endDate || ev.date }
          : { dateTime: `${ev.endDate || ev.date}T${ev.endTime || '10:00'}:00` };

        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${req.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: ev.title,
              location: ev.location || undefined,
              description: ev.description || undefined,
              start: startObj,
              end: endObj,
            }),
          }
        );
        const data: any = await res.json();
        if (!res.ok) return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
        return { success: true, remoteId: `google-${data.id}` };
      }

      if (req.provider === 'microsoft') {
        if (!req.accessToken) return { success: false, error: 'Token OAuth2 Microsoft ausente.' };
        const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${req.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject: ev.title,
            isAllDay: Boolean(ev.allDay),
            location: ev.location ? { displayName: ev.location } : undefined,
            body: ev.description ? { contentType: 'Text', content: ev.description } : undefined,
            start: {
              dateTime: `${ev.date}T${ev.startTime || '09:00'}:00`,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
            },
            end: {
              dateTime: `${ev.endDate || ev.date}T${ev.endTime || '10:00'}:00`,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
            },
          }),
        });
        const data: any = await res.json();
        if (!res.ok) return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
        return { success: true, remoteId: `m365-${data.id}` };
      }

      // CalDAV PUT
      const baseUrl = (req.caldavUrl || '').trim().replace(/\/+$/, '');
      if (!baseUrl) return { success: false, error: 'URL CalDAV não configurada.' };
      const uid = `${ev.id || Date.now()}@anectta.local`;
      const dtStart = ev.allDay
        ? ev.date.replace(/-/g, '')
        : `${ev.date.replace(/-/g, '')}T${(ev.startTime || '09:00').replace(':', '')}00`;
      const dtEnd = ev.allDay
        ? (ev.endDate || ev.date).replace(/-/g, '')
        : `${(ev.endDate || ev.date).replace(/-/g, '')}T${(ev.endTime || '10:00').replace(':', '')}00`;
      const icsBody = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Anectta MAIL//CalDAV//PT-BR',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        ev.allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
        ev.allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
        `SUMMARY:${ev.title}`,
        ev.location ? `LOCATION:${ev.location}` : '',
        ev.description ? `DESCRIPTION:${ev.description.replace(/\r?\n/g, '\\n')}` : '',
        'END:VEVENT',
        'END:VCALENDAR',
      ]
        .filter(Boolean)
        .join('\r\n');

      const res = await fetch(`${baseUrl}/${encodeURIComponent(uid)}.ics`, {
        method: 'PUT',
        headers: {
          Authorization: basicAuthHeader(req.username, req.password),
          'Content-Type': 'text/calendar; charset=utf-8',
        },
        body: icsBody,
      });
      if (!res.ok) return { success: false, error: `CalDAV PUT retornou HTTP ${res.status}.` };
      return { success: true, remoteId: `caldav-${uid}` };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao publicar evento na nuvem.' };
    }
  }

  /**
   * Sincroniza contatos do Google People API, Microsoft Graph ou CardDAV.
   */
  public static async syncContacts(
    req: CloudSyncContactsRequest
  ): Promise<{ success: boolean; contacts?: CloudContactDTO[]; error?: string }> {
    try {
      if (req.provider === 'google') {
        if (!req.accessToken) {
          return { success: false, error: 'Token OAuth2 do Google ausente. Reconecte a conta Google.' };
        }
        const url =
          'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations&pageSize=500';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${req.accessToken}` },
        });
        const data: any = await res.json();
        if (!res.ok) {
          return {
            success: false,
            error: data?.error?.message || `Google Contacts retornou HTTP ${res.status}.`,
          };
        }

        const contacts: CloudContactDTO[] = [];
        for (const p of data.connections || []) {
          const email = p.emailAddresses?.[0]?.value?.trim()?.toLowerCase();
          if (!email) continue;
          contacts.push({
            name: p.names?.[0]?.displayName || email.split('@')[0],
            email,
            phone: p.phoneNumbers?.[0]?.value || undefined,
            company: p.organizations?.[0]?.name || undefined,
            role: p.organizations?.[0]?.title || undefined,
            groups: [req.sourceLabel || 'Google Contacts'],
          });
        }
        return { success: true, contacts };
      }

      if (req.provider === 'microsoft') {
        if (!req.accessToken) {
          return { success: false, error: 'Token OAuth2 Microsoft ausente. Reconecte a conta Microsoft 365.' };
        }
        const url =
          'https://graph.microsoft.com/v1.0/me/contacts?$top=500&$select=displayName,emailAddresses,mobilePhone,businessPhones,companyName,jobTitle,categories';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${req.accessToken}` },
        });
        const data: any = await res.json();
        if (!res.ok) {
          return {
            success: false,
            error: data?.error?.message || `Microsoft Graph Contacts retornou HTTP ${res.status}.`,
          };
        }

        const contacts: CloudContactDTO[] = [];
        for (const c of data.value || []) {
          const email = c.emailAddresses?.[0]?.address?.trim()?.toLowerCase();
          if (!email) continue;
          const cats = Array.isArray(c.categories) ? c.categories.filter(Boolean) : [];
          contacts.push({
            name: c.displayName || email.split('@')[0],
            email,
            phone: c.mobilePhone || c.businessPhones?.[0] || undefined,
            company: c.companyName || undefined,
            role: c.jobTitle || undefined,
            groups: [req.sourceLabel || 'Microsoft 365', ...cats],
          });
        }
        return { success: true, contacts };
      }

      // CardDAV (RFC 6352)
      const carddavUrl = (req.carddavUrl || '').trim();
      if (!carddavUrl) {
        return { success: false, error: 'URL CardDAV não configurada.' };
      }
      const queryXml = `<?xml version="1.0" encoding="utf-8" ?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <card:address-data />
  </d:prop>
</card:addressbook-query>`;

      const res = await fetch(carddavUrl, {
        method: 'REPORT',
        headers: {
          Authorization: basicAuthHeader(req.username, req.password),
          Depth: '1',
          'Content-Type': 'application/xml; charset=utf-8',
        },
        body: queryXml,
      });

      const xmlText = await res.text();
      if (res.status !== 207 && !(res.status >= 200 && res.status < 300)) {
        return { success: false, error: `CardDAV retornou HTTP ${res.status}. Verifique URL e credenciais.` };
      }

      const cardMatches = [...xmlText.matchAll(/<(?:\w+:)?address-data[^>]*>([\s\S]*?)<\/(?:\w+:)?address-data>/gi)];
      const contacts: CloudContactDTO[] = [];
      for (const m of cardMatches) {
        const vcf = decodeXmlEntities(m[1] || '');
        contacts.push(...parseVCardBlocks(vcf, req.sourceLabel || 'CardDAV'));
      }
      return { success: true, contacts };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao sincronizar contatos na nuvem.' };
    }
  }

  /**
   * Atualiza um evento existente no Google Calendar, Microsoft Graph ou CalDAV.
   */
  public static async updateCalendarEvent(req: {
    provider: 'google' | 'microsoft' | 'caldav';
    accessToken?: string;
    caldavUrl?: string;
    username?: string;
    password?: string;
    remoteId: string;
    calendarId?: string;
    event: {
      id: string;
      title: string;
      date: string;
      endDate?: string;
      startTime?: string;
      endTime?: string;
      allDay?: boolean;
      location?: string;
      description?: string;
    };
  }): Promise<{ success: boolean; error?: string }> {
    const ev = req.event;
    const rawId = req.remoteId.replace(/^(google|ms|caldav)-/, '');
    try {
      if (req.provider === 'google') {
        if (!req.accessToken) return { success: false, error: 'Token OAuth2 do Google ausente.' };
        const calId = encodeURIComponent(req.calendarId || 'primary');
        const startObj = ev.allDay
          ? { date: ev.date }
          : { dateTime: `${ev.date}T${ev.startTime || '09:00'}:00` };
        const endObj = ev.allDay
          ? { date: ev.endDate || ev.date }
          : { dateTime: `${ev.endDate || ev.date}T${ev.endTime || '10:00'}:00` };

        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(rawId)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${req.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: ev.title,
              location: ev.location || undefined,
              description: ev.description || undefined,
              start: startObj,
              end: endObj,
            }),
          }
        );
        if (!res.ok) {
          const data: any = await res.json().catch(() => ({}));
          return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
        }
        return { success: true };
      }

      if (req.provider === 'microsoft') {
        if (!req.accessToken) return { success: false, error: 'Token OAuth2 Microsoft ausente.' };
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(rawId)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${req.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subject: ev.title,
              isAllDay: Boolean(ev.allDay),
              location: ev.location ? { displayName: ev.location } : undefined,
              body: ev.description ? { contentType: 'Text', content: ev.description } : undefined,
              start: {
                dateTime: `${ev.date}T${ev.startTime || '09:00'}:00`,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
              },
              end: {
                dateTime: `${ev.endDate || ev.date}T${ev.endTime || '10:00'}:00`,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
              },
            }),
          }
        );
        if (!res.ok) {
          const data: any = await res.json().catch(() => ({}));
          return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
        }
        return { success: true };
      }

      // CalDAV PUT overwrite
      const base = (req.caldavUrl || '').trim().replace(/\/+$/, '');
      if (!base || !req.username || !req.password) {
        return { success: false, error: 'Credenciais CalDAV incompletas.' };
      }
      const uid = rawId || `${ev.id}@anectta.mail`;
      const dtStart = ev.allDay
        ? `DTSTART;VALUE=DATE:${ev.date.replace(/-/g, '')}`
        : `DTSTART:${ev.date.replace(/-/g, '')}T${(ev.startTime || '09:00').replace(':', '')}00`;
      const dtEnd = ev.allDay
        ? `DTEND;VALUE=DATE:${(ev.endDate || ev.date).replace(/-/g, '')}`
        : `DTEND:${(ev.endDate || ev.date).replace(/-/g, '')}T${(ev.endTime || '10:00').replace(':', '')}00`;
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Anectta MAIL//CalDAV Sync V2//PT',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
        dtStart,
        dtEnd,
        `SUMMARY:${ev.title}`,
        ev.location ? `LOCATION:${ev.location}` : '',
        ev.description ? `DESCRIPTION:${ev.description.replace(/\r?\n/g, '\\n')}` : '',
        'END:VEVENT',
        'END:VCALENDAR',
      ]
        .filter(Boolean)
        .join('\r\n');

      const putRes = await fetch(`${base}/${encodeURIComponent(uid)}.ics`, {
        method: 'PUT',
        headers: {
          Authorization: basicAuthHeader(req.username, req.password),
          'Content-Type': 'text/calendar; charset=utf-8',
        },
        body: ics,
      });
      if (!putRes.ok) return { success: false, error: `CalDAV PUT retornou HTTP ${putRes.status}` };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao atualizar evento na nuvem.' };
    }
  }

  /**
   * Exclui um evento no Google Calendar, Microsoft Graph ou CalDAV.
   */
  public static async deleteCalendarEvent(req: {
    provider: 'google' | 'microsoft' | 'caldav';
    accessToken?: string;
    caldavUrl?: string;
    username?: string;
    password?: string;
    remoteId: string;
    calendarId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const rawId = req.remoteId.replace(/^(google|ms|caldav)-/, '');
    try {
      if (req.provider === 'google') {
        if (!req.accessToken) return { success: false, error: 'Token OAuth2 do Google ausente.' };
        const calId = encodeURIComponent(req.calendarId || 'primary');
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(rawId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${req.accessToken}` },
          }
        );
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          return { success: false, error: `Google Calendar DELETE retornou HTTP ${res.status}` };
        }
        return { success: true };
      }

      if (req.provider === 'microsoft') {
        if (!req.accessToken) return { success: false, error: 'Token OAuth2 Microsoft ausente.' };
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(rawId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${req.accessToken}` },
          }
        );
        if (!res.ok && res.status !== 404) {
          return { success: false, error: `Microsoft Graph DELETE retornou HTTP ${res.status}` };
        }
        return { success: true };
      }

      const base = (req.caldavUrl || '').trim().replace(/\/+$/, '');
      if (!base || !req.username || !req.password) {
        return { success: false, error: 'Credenciais CalDAV incompletas.' };
      }
      const delRes = await fetch(`${base}/${encodeURIComponent(rawId)}.ics`, {
        method: 'DELETE',
        headers: { Authorization: basicAuthHeader(req.username, req.password) },
      });
      if (!delRes.ok && delRes.status !== 404) {
        return { success: false, error: `CalDAV DELETE retornou HTTP ${delRes.status}` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao excluir evento na nuvem.' };
    }
  }

  /**
   * Lista calendários remotos disponíveis na conta Google ou Microsoft 365.
   */
  public static async listRemoteCalendars(req: {
    provider: 'google' | 'microsoft';
    accessToken: string;
  }): Promise<{
    success: boolean;
    calendars?: Array<{ id: string; name: string; primary?: boolean; color?: string }>;
    error?: string;
  }> {
    try {
      if (req.provider === 'google') {
        const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { Authorization: `Bearer ${req.accessToken}` },
        });
        const data: any = await res.json();
        if (!res.ok) return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
        const calendars = (data.items || []).map((c: any) => ({
          id: String(c.id),
          name: String(c.summary || c.id),
          primary: Boolean(c.primary),
          color: c.backgroundColor,
        }));
        return { success: true, calendars };
      }

      const res = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
        headers: { Authorization: `Bearer ${req.accessToken}` },
      });
      const data: any = await res.json();
      if (!res.ok) return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
      const calendars = (data.value || []).map((c: any) => ({
        id: String(c.id),
        name: String(c.name || c.id),
        primary: Boolean(c.isDefaultCalendar),
        color: c.hexColor,
      }));
      return { success: true, calendars };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao listar calendários remotos.' };
    }
  }
}
