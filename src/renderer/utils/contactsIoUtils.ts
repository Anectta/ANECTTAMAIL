export interface ExportableContact {
  id: string;
  name: string;
  email: string;
  role?: string;
  company?: string;
  phone?: string;
  avatar?: string;
  groups?: string[];
}

function unescapeVCardValue(val: string): string {
  return val
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function escapeVCardValue(val?: string): string {
  return String(val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

/**
 * Faz parse de arquivos vCard (.vcf) 2.1 / 3.0 / 4.0 em lista de contatos.
 */
export function parseVCardContacts(vcfText: string): Array<Omit<ExportableContact, 'id'>> {
  if (!vcfText) return [];
  // Unfold de linhas dobradas (RFC 6350)
  const unfolded = vcfText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) || [];
  const results: Array<Omit<ExportableContact, 'id'>> = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let fn = '';
    let nField = '';
    let email = '';
    let phone = '';
    let company = '';
    let role = '';
    const groups: string[] = [];

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      const rawKey = line.slice(0, colonIdx).toUpperCase();
      const baseKey = rawKey.split(';')[0].replace(/^ITEM\d+\./, '');
      const rawVal = line.slice(colonIdx + 1).trim();
      if (!rawVal) continue;

      if (baseKey === 'FN' && !fn) {
        fn = unescapeVCardValue(rawVal);
      } else if (baseKey === 'N' && !nField) {
        const parts = rawVal.split(';').map((p) => unescapeVCardValue(p)).filter(Boolean);
        // N: Sobrenome;Nome;Meio;...
        nField = parts.length >= 2 ? `${parts[1]} ${parts[0]}`.trim() : parts[0] || '';
      } else if (baseKey === 'EMAIL' && !email) {
        const cleanEmail = rawVal.replace(/^mailto:/i, '').trim().toLowerCase();
        if (cleanEmail.includes('@')) email = cleanEmail;
      } else if (baseKey === 'TEL' && !phone) {
        phone = unescapeVCardValue(rawVal);
      } else if (baseKey === 'ORG' && !company) {
        company = unescapeVCardValue(rawVal.split(';')[0]);
      } else if (baseKey === 'TITLE' && !role) {
        role = unescapeVCardValue(rawVal);
      } else if (baseKey === 'CATEGORIES') {
        for (const cat of rawVal.split(',')) {
          const cleanCat = unescapeVCardValue(cat);
          if (cleanCat && !groups.includes(cleanCat)) groups.push(cleanCat);
        }
      }
    }

    if (!email) continue;
    const name = fn || nField || email.split('@')[0];
    results.push({
      name,
      email,
      phone: phone || undefined,
      company: company || undefined,
      role: role || undefined,
      groups: groups.length > 0 ? groups : undefined,
    });
  }

  return results;
}

/**
 * Exporta contatos no formato padrão vCard 3.0 (.vcf).
 */
export function exportContactsToVCard(contacts: ExportableContact[]): string {
  return contacts
    .map((c) => {
      const nameParts = (c.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ');
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`,
        `FN:${escapeVCardValue(c.name || c.email)}`,
        `EMAIL;TYPE=INTERNET:${c.email.trim()}`,
        c.phone ? `TEL;TYPE=CELL:${escapeVCardValue(c.phone)}` : '',
        c.company ? `ORG:${escapeVCardValue(c.company)}` : '',
        c.role ? `TITLE:${escapeVCardValue(c.role)}` : '',
        c.groups && c.groups.length > 0
          ? `CATEGORIES:${c.groups.map((g) => escapeVCardValue(g)).join(',')}`
          : '',
        'END:VCARD',
      ].filter(Boolean);
      return lines.join('\r\n');
    })
    .join('\r\n');
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Faz parse de arquivo CSV (PT-BR ou EN-US, delimitador "," ou ";") em lista de contatos.
 */
export function parseCsvContacts(csvText: string): Array<Omit<ExportableContact, 'id'>> {
  if (!csvText) return [];
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const delimiter =
    (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ',';
  const headers = parseCsvLine(headerLine, delimiter).map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  );

  const findCol = (patterns: RegExp[]): number =>
    headers.findIndex((h) => patterns.some((p) => p.test(h)));

  const emailIdx = findCol([/^e-?mail/, /email address/, /endereco.*email/]);
  const nameIdx = findCol([/^nome$/, /^name$/, /nome completo/, /full name/, /display name/]);
  const firstNameIdx = findCol([/primeiro nome/, /first name/]);
  const lastNameIdx = findCol([/sobrenome/, /last name/]);
  const phoneIdx = findCol([/telefone/, /celular/, /phone/, /mobile/, /fone/]);
  const companyIdx = findCol([/empresa/, /company/, /organizacao/, /organization/]);
  const roleIdx = findCol([/cargo/, /funcao/, /role/, /job title/, /^title$/]);
  const groupsIdx = findCol([/grupo/, /grupos/, /group/, /groups/, /categoria/, /categories/, /lista/]);

  const results: Array<Omit<ExportableContact, 'id'>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const rawEmail =
      emailIdx >= 0
        ? cols[emailIdx] || ''
        : cols.find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) || '';
    const email = rawEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) continue;

    let name = nameIdx >= 0 ? cols[nameIdx] || '' : '';
    if (!name && (firstNameIdx >= 0 || lastNameIdx >= 0)) {
      name = [
        firstNameIdx >= 0 ? cols[firstNameIdx] || '' : '',
        lastNameIdx >= 0 ? cols[lastNameIdx] || '' : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    if (!name) name = email.split('@')[0];

    const phone = phoneIdx >= 0 ? cols[phoneIdx] || '' : '';
    const company = companyIdx >= 0 ? cols[companyIdx] || '' : '';
    const role = roleIdx >= 0 ? cols[roleIdx] || '' : '';
    const rawGroups = groupsIdx >= 0 ? cols[groupsIdx] || '' : '';
    const groups = rawGroups
      ? rawGroups
          .split(/[|,;]+/)
          .map((g) => g.trim())
          .filter(Boolean)
      : [];

    results.push({
      name: name.trim(),
      email,
      phone: phone.trim() || undefined,
      company: company.trim() || undefined,
      role: role.trim() || undefined,
      groups: groups.length > 0 ? groups : undefined,
    });
  }

  return results;
}

function escapeCsvField(value?: string): string {
  const s = String(value || '');
  if (/[;"\r\n,]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Exporta contatos para CSV com BOM UTF-8 (abre com acentuação correta no Excel).
 */
export function exportContactsToCsv(contacts: ExportableContact[]): string {
  const header = ['Nome', 'E-mail', 'Telefone', 'Empresa', 'Cargo', 'Grupos'].join(';');
  const rows = contacts.map((c) =>
    [
      escapeCsvField(c.name),
      escapeCsvField(c.email),
      escapeCsvField(c.phone),
      escapeCsvField(c.company),
      escapeCsvField(c.role),
      escapeCsvField((c.groups || []).join(', ')),
    ].join(';')
  );
  return `\uFEFF${[header, ...rows].join('\r\n')}`;
}
