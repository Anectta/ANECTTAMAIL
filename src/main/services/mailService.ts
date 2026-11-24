import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import crypto from 'crypto';
import { simpleParser } from 'mailparser';
import { SimplePop3Client } from './pop3Client';
import { isTlsHostTrusted } from './tlsTrust';
import { getDataStorageDir } from './storagePath';

export interface MailServerConfig {
  protocol?: 'imap' | 'pop3';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  accessToken?: string;
  leaveOnServer?: boolean;
  knownUidsByFolder?: Record<string, number[]>;
}

export interface QuotaInfo {
  usedBytes: number;
  limitBytes: number;
}

/**
 * Ação do app refletida no servidor IMAP. folderKey = pasta ONDE A MENSAGEM ESTÁ no servidor
 * ('inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'imap:<caminho>').
 */
export interface ImapServerAction {
  ref: string;
  kind: 'move' | 'flags' | 'delete';
  folderKey: string;
  uid: number;
  toFolderKey?: string;
  seen?: boolean;
  flagged?: boolean;
}

export interface ImapServerActionResult {
  ref: string;
  ok: boolean;
  /** true = falha de rede/conexão: o app tenta de novo depois. false = servidor recusou. */
  retry?: boolean;
  error?: string;
  /** Nova localização após mover (quando o servidor informa o novo UID — extensão UIDPLUS). */
  newLocation?: { folderKey: string; uid: number };
}

export interface DiscoveredCustomFolder {
  imapPath: string;
  name: string;
  parentImapPath?: string;
  parentSystemFolder?: SupportedFolder;
  delimiter?: string;
}

export interface FetchResult {
  success: boolean;
  emails?: any[];
  error?: string;
  count?: number;
  serverTotal?: number;
  serverTotals?: Record<string, number>;
  hasMore?: boolean;
  /** Modo "somente faltantes": UIDs tentados neste lote (com ou sem sucesso) e quantos ainda faltam. */
  attemptedUids?: number[];
  remaining?: number;
  /** Sincronização: pastas com mensagens novas ainda por recuperar (pasta -> quantidade). */
  catchUpPending?: Record<string, number>;
  /** Sincronização: UIDs que o app conhecia e não existem mais no servidor (pasta -> UIDs). */
  vanished?: Record<string, number[]>;
  /** Diagnóstico da comparação servidor × app (gravado no imap-sync.log). */
  diag?: string[];
  /** Caminho da pasta aberta no servidor (diagnóstico). */
  mailboxPath?: string;
  folderStats?: Record<string, number>;
  customFolders?: DiscoveredCustomFolder[];
  /** Caminhos de todas as pastas existentes no servidor (sincronização completa). */
  serverFolderPaths?: string[];
  quota?: QuotaInfo;
  flagUpdates?: Array<{ id: string; isRead: boolean; isStarred: boolean }>;
}

export type SupportedFolder = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'junk';

const EMAIL_ADDRESS_REGEX = /([^\s,;<>'"]+@[^\s,;<>'"]+\.[^\s,;<>'"]+)/;

/**
 * Extracts and validates a single email address from a raw header or address string.
 */
function extractValidEmail(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const text = String(raw).replace(/^mailto:/i, '').trim();
  if (!text) return undefined;
  const bracketMatch = text.match(/<([^\s<>'"]+@[^\s<>'"]+\.[^\s<>'"]+)>/);
  const candidate = (bracketMatch ? bracketMatch[1] : text.match(EMAIL_ADDRESS_REGEX)?.[1] || '').trim();
  return /^[^\s@<>'"]+@[^\s@<>'"]+\.[^\s@<>'"]+$/.test(candidate) ? candidate : undefined;
}

/**
 * Extracts a validated read-receipt (MDN) return address from parsed email headers,
 * falling back to the sender's email if the header value is malformed.
 */
function extractReadReceiptAddress(headers: any, fallbackSenderEmail: string): string | undefined {
  if (!headers || typeof headers.get !== 'function') return undefined;
  const rawHeader =
    headers.get('disposition-notification-to') ||
    headers.get('return-receipt-to') ||
    headers.get('x-confirm-reading-to');
  if (!rawHeader) return undefined;

  const firstEntry = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const rawCandidates: unknown[] =
    typeof firstEntry === 'object' && firstEntry !== null
      ? [firstEntry.value?.[0]?.address, firstEntry.text]
      : [firstEntry];

  for (const candidate of rawCandidates) {
    const valid = extractValidEmail(candidate);
    if (valid) return valid;
  }

  return extractValidEmail(fallbackSenderEmail);
}

function formatParsedAddressField(field: any): string | undefined {
  if (!field) return undefined;
  if (Array.isArray(field)) {
    const joined = field
      .map((entry: any) => entry?.text || (entry?.name ? `${entry.name} <${entry.address}>` : entry?.address))
      .filter(Boolean)
      .join(', ');
    return joined || undefined;
  }
  return field.text ? String(field.text).trim() || undefined : undefined;
}

function extractListHeaders(headers: any): {
  listUnsubscribe?: string;
  listUnsubscribePost?: string;
  listId?: string;
  precedence?: string;
} {
  if (!headers || typeof headers.get !== 'function') return {};
  const toStr = (val: any): string | undefined => {
    if (!val) return undefined;
    if (typeof val === 'string') return val.trim() || undefined;
    if (typeof val === 'object') {
      if (typeof val.value === 'string') return val.value.trim() || undefined;
      if (typeof val.text === 'string') return val.text.trim() || undefined;
      if (typeof val.url === 'string') return val.url.trim() || undefined;
      if (val.unsubscribe) {
        const parts: string[] = [];
        if (val.unsubscribe.url) parts.push(`<${val.unsubscribe.url}>`);
        if (val.unsubscribe.mail) parts.push(`<mailto:${val.unsubscribe.mail}>`);
        if (parts.length > 0) return parts.join(', ');
      }
    }
    return String(val).trim() || undefined;
  };
  return {
    listUnsubscribe: toStr(headers.get('list-unsubscribe')),
    listUnsubscribePost: toStr(headers.get('list-unsubscribe-post')),
    listId: toStr(headers.get('list-id')),
    precedence: toStr(headers.get('precedence')),
  };
}

function parseReferencesHeader(raw: unknown): string[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    const key = clean.replace(/[<>]/g, '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function parseIcsDateTimeValue(rawVal: string): { date: string; time: string; allDay: boolean } | null {
  const clean = rawVal.trim();
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, z] = match;
  if (!hh || !mm) {
    return { date: `${y}-${m}-${d}`, time: '00:00', allDay: true };
  }
  if (z) {
    const utcDate = new Date(
      Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || '0'))
    );
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      date: `${utcDate.getFullYear()}-${pad(utcDate.getMonth() + 1)}-${pad(utcDate.getDate())}`,
      time: `${pad(utcDate.getHours())}:${pad(utcDate.getMinutes())}`,
      allDay: false,
    };
  }
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}`, allDay: false };
}

function unescapeIcsText(val: string): string {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Extrai dados de convite de reunião (.ics / text/calendar) de uma mensagem parseada pelo mailparser.
 */
function extractCalendarInviteFromParsed(parsed: any): any | undefined {
  let icsText = '';
  const attachments = Array.isArray(parsed?.attachments) ? parsed.attachments : [];

  for (const att of attachments) {
    const ct = String(att?.contentType || '').toLowerCase();
    const fn = String(att?.filename || att?.name || '').toLowerCase();
    if ((ct.includes('text/calendar') || fn.endsWith('.ics')) && att?.content && Buffer.isBuffer(att.content)) {
      icsText = att.content.toString('utf8');
      break;
    }
  }

  if (!icsText && typeof parsed?.text === 'string' && parsed.text.includes('BEGIN:VEVENT')) {
    icsText = parsed.text;
  }
  if (!icsText || !/BEGIN:VEVENT/i.test(icsText)) return undefined;

  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const methodMatch = unfolded.match(/^METHOD:([^\r\n]+)/im);
  const method = methodMatch ? methodMatch[1].trim().toUpperCase() : 'REQUEST';

  const eventMatch = unfolded.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i);
  if (!eventMatch) return undefined;

  const lines = eventMatch[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let uid = '';
  let summary = '';
  let location = '';
  let description = '';
  let organizerName = '';
  let organizerEmail = '';
  let startParsed: { date: string; time: string; allDay: boolean } | null = null;
  let endParsed: { date: string; time: string; allDay: boolean } | null = null;

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const rawKey = line.slice(0, colonIdx);
    const keyUpper = rawKey.toUpperCase();
    const baseKey = keyUpper.split(';')[0];
    const value = line.slice(colonIdx + 1).trim();

    if (baseKey === 'UID') uid = value;
    else if (baseKey === 'SUMMARY') summary = unescapeIcsText(value);
    else if (baseKey === 'LOCATION') location = unescapeIcsText(value);
    else if (baseKey === 'DESCRIPTION') description = unescapeIcsText(value);
    else if (baseKey === 'DTSTART') startParsed = parseIcsDateTimeValue(value);
    else if (baseKey === 'DTEND') endParsed = parseIcsDateTimeValue(value);
    else if (baseKey === 'ORGANIZER') {
      const cnMatch = rawKey.match(/CN=(?:"([^"]+)"|([^;:]+))/i);
      if (cnMatch) organizerName = (cnMatch[1] || cnMatch[2] || '').trim();
      const mailto = value.replace(/^mailto:/i, '').trim();
      if (mailto.includes('@')) organizerEmail = mailto;
    }
  }

  if (!startParsed) return undefined;

  const combinedForLink = `${location}\n${description}`;
  const urlMatch = combinedForLink.match(
    /(https?:\/\/(?:meet\.google\.com|teams\.microsoft\.com|[\w-]*\.?zoom\.us|meet\.jit\.si|whereby\.com)[^\s<>"']+)/i
  );

  return {
    uid: uid || `ics-${Date.now()}`,
    method,
    summary: summary || parsed?.subject || 'Convite de Reunião',
    date: startParsed.date,
    endDate: endParsed?.date || startParsed.date,
    startTime: startParsed.time,
    endTime: endParsed?.time || startParsed.time,
    allDay: startParsed.allDay,
    location: location || undefined,
    organizerName: organizerName || parsed?.from?.value?.[0]?.name || undefined,
    organizerEmail: organizerEmail || parsed?.from?.value?.[0]?.address || undefined,
    description: description ? description.slice(0, 800) : undefined,
    meetingUrl: urlMatch ? urlMatch[1] : undefined,
  };
}

/**
 * Resolve referências cid: em HTML recebido usando buffers de anexos embutidos.
 */
function resolveCidImagesInHtml(html: string, attachments?: any[]): string {
  if (!html || !Array.isArray(attachments) || attachments.length === 0 || !/cid:/i.test(html)) {
    return html;
  }

  const cidMap = new Map<string, string>();
  for (const att of attachments) {
    const rawCid = String(att?.cid || att?.contentId || '')
      .replace(/^<|>$/g, '')
      .trim()
      .toLowerCase();
    if (!rawCid || !att?.content || !Buffer.isBuffer(att.content)) continue;
    const mime = att.contentType || 'image/png';
    cidMap.set(rawCid, `data:${mime};base64,${att.content.toString('base64')}`);
  }

  if (cidMap.size === 0) return html;

  return html.replace(/(src\s*=\s*['"])cid:([^'"]+)(['"])/gi, (full, prefix, cidRef, suffix) => {
    const key = String(cidRef || '').replace(/^<|>$/g, '').trim().toLowerCase();
    const resolved = cidMap.get(key);
    return resolved ? `${prefix}${resolved}${suffix}` : full;
  });
}

/**
 * Converte imagens data:image/...;base64,... de um HTML para anexos inline RFC 2392 (cid:).
 */
function extractDataUrlImagesToCid(html: string): {
  html: string;
  inlineAttachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    cid: string;
    contentDisposition: 'inline';
  }>;
} {
  if (!html || !/data:image\//i.test(html)) {
    return { html, inlineAttachments: [] };
  }

  const inlineAttachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    cid: string;
    contentDisposition: 'inline';
  }> = [];
  const dedupeMap = new Map<string, string>();
  let index = 0;

  const updatedHtml = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*(['"]))data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,([^'"]+)(\2[^>]*>)/gi,
    (_match, prefix, _quote, rawSubtype, rawBase64, suffix) => {
      const subtype = String(rawSubtype).toLowerCase();
      const mimeSubtype = subtype === 'jpg' ? 'jpeg' : subtype;
      const cleanBase64 = String(rawBase64).replace(/\s+/g, '');
      const cacheKey = `${mimeSubtype}:${cleanBase64}`;

      let cid = dedupeMap.get(cacheKey);
      if (!cid) {
        index += 1;
        const ext = subtype === 'jpeg' ? 'jpg' : subtype;
        cid = `anectta-inline-${Date.now()}-${index}@anectta.local`;
        dedupeMap.set(cacheKey, cid);
        inlineAttachments.push({
          filename: `inline-image-${index}.${ext}`,
          content: Buffer.from(cleanBase64, 'base64'),
          contentType: `image/${mimeSubtype}`,
          cid,
          contentDisposition: 'inline',
        });
      }

      return `${prefix}cid:${cid}${suffix}`;
    }
  );

  return { html: updatedHtml, inlineAttachments };
}

export class MailService {
  /**
   * Universal test connection (routes to IMAP or POP3 based on protocol)
   */
  public static async testIncomingConnection(config: MailServerConfig): Promise<{ success: boolean; message: string }> {
    if (config.protocol === 'pop3') {
      return await this.testPop3Connection(config);
    }
    return await this.testImapConnection(config);
  }

  /**
   * Universal fetch inbox (routes to IMAP or POP3)
   */
  public static async fetchIncomingInbox(config: MailServerConfig): Promise<FetchResult> {
    if (config.protocol === 'pop3') {
      return await this.fetchPop3Inbox(config);
    }
    return await this.fetchFolderMessages(config, 'inbox');
  }

  /**
   * Test IMAP incoming server connection
   */
  public static async testImapConnection(config: MailServerConfig): Promise<{ success: boolean; message: string }> {
    if (!config.host || !config.user || (!config.pass && !config.accessToken)) {
      return {
        success: false,
        message: 'Preencha o servidor, usuário e senha (ou conecte via OAuth 2.0) para conectar ao IMAP.',
      };
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: {
        rejectUnauthorized: !isTlsHostTrusted(config.host),
      },
      logger: false,
    });
    client.on('error', (err: any) => {
      console.warn('[IMAP-TEST] Erro assíncrono no socket IMAP:', err?.message || err);
    });

    try {
      await client.connect();
      const status = await client.status('INBOX', { messages: true, unseen: true });
      const totalMessages = (status && typeof status === 'object' && status.messages) || 0;
      const totalUnseen = (status && typeof status === 'object' && status.unseen) || 0;
      await client.logout();
      return {
        success: true,
        message: `Conectado com sucesso via IMAP! ${totalMessages} mensagens encontradas no servidor (${totalUnseen} não lidas).`,
      };
    } catch (err: any) {
      console.error('[IMAP-TEST] Erro de conexão:', err);
      const isYahoo =
        (config.host && config.host.toLowerCase().includes('yahoo')) ||
        (config.user && config.user.toLowerCase().includes('yahoo'));
      const isGmail =
        (config.host && config.host.toLowerCase().includes('gmail')) ||
        (config.user && config.user.toLowerCase().includes('gmail'));
      const isApple =
        (config.host && (config.host.toLowerCase().includes('apple') || config.host.toLowerCase().includes('icloud') || config.host.toLowerCase().includes('mail.me.com'))) ||
        (config.user && (config.user.toLowerCase().includes('@icloud.') || config.user.toLowerCase().includes('@me.com') || config.user.toLowerCase().includes('@mac.com')));
      const isAol =
        (config.host && config.host.toLowerCase().includes('aol')) ||
        (config.user && (config.user.toLowerCase().includes('@aol.') || config.user.toLowerCase().includes('@aim.com')));
      const isMicrosoft =
        (config.host && (config.host.toLowerCase().includes('outlook') || config.host.toLowerCase().includes('office365') || config.host.toLowerCase().includes('hotmail'))) ||
        (config.user && (config.user.toLowerCase().includes('@outlook.') || config.user.toLowerCase().includes('@hotmail.') || config.user.toLowerCase().includes('@live.') || config.user.toLowerCase().includes('@msn.')));

      let detailed = err.responseText || err.message || 'Falha na autenticação';
      if (err.authenticationFailed || err.message === 'Command failed' || err.message?.includes('AUTHENTICATIONFAILED') || err.message?.includes('LOGIN failed')) {
        if (isMicrosoft) {
          detailed =
            'A Microsoft desativou o login por senha comum e senhas de app para contas @outlook.com, @hotmail.com e @live.com via IMAP. Conexões diretas por senha não são mais aceitas (a Microsoft exige autenticação moderna OAuth 2.0).';
        } else if (isYahoo) {
          detailed =
            'Credenciais recusadas pelo Yahoo. O Yahoo exige uma "Senha de Aplicativo" de 16 caracteres gerada na Central de Segurança do Yahoo (não utilize sua senha pessoal de login).';
        } else if (isGmail) {
          detailed =
            'Credenciais recusadas pelo Google. O Gmail exige uma "Senha de App" de 16 caracteres gerada na Conta Google (Segurança > Senhas de app com Verificação em Duas Etapas ativa).';
        } else if (isApple) {
          detailed =
            'Credenciais recusadas pela Apple. O iCloud Mail exige obrigatoriamente uma "Senha Específica de App" gerada nas configurações do seu ID Apple (appleid.apple.com).';
        } else if (isAol) {
          detailed =
            'Credenciais recusadas pela AOL. O AOL Mail pertence ao grupo Yahoo e exige uma "Senha de Aplicativo" gerada na Central de Segurança da AOL.';
        } else {
          detailed = `Credenciais recusadas ou comando não suportado: ${err.responseText || err.message}`;
        }
      }

      return {
        success: false,
        message: `Falha ao conectar via IMAP: ${detailed}`,
      };
    }
  }

  /**
   * Test POP3 incoming server connection
   */
  public static async testPop3Connection(config: MailServerConfig): Promise<{ success: boolean; message: string }> {
    if (!config.host || !config.user || !config.pass) {
      return {
        success: false,
        message: 'Preencha o servidor, usuário e senha para conectar ao POP3.',
      };
    }

    const pop3 = new SimplePop3Client({
      user: config.user,
      pass: config.pass,
      host: config.host,
      port: config.port || 995,
      tls: config.secure !== false,
      rejectUnauthorized: !isTlsHostTrusted(config.host),
      timeout: 10000,
    });

    try {
      await pop3.connect();
      await pop3.login();
      const stat = await pop3.stat();
      await pop3.quit();

      return {
        success: true,
        message: `Conectado com sucesso via POP3! ${stat.count} mensagens disponíveis no servidor para download local.`,
      };
    } catch (err: any) {
      pop3.close();
      return {
        success: false,
        message: `Falha ao conectar via POP3: ${err.message || 'Verifique o host, porta (995 SSL) e senha.'}`,
      };
    }
  }

  /**
   * Discovers matching server mailbox path for a logical folder
   */
  public static findServerMailbox(mailboxes: any[], folder: SupportedFolder): string | null {
    if (folder === 'inbox') {
      return 'INBOX';
    }

    const specialUseMap: Record<SupportedFolder, string> = {
      inbox: '\\inbox',
      sent: '\\sent',
      drafts: '\\drafts',
      trash: '\\trash',
      junk: '\\junk',
      archive: '\\archive',
    };

    const targetSpecial = specialUseMap[folder];
    if (targetSpecial) {
      const match = mailboxes.find((m) => {
        const special = (m.specialUse || '').toLowerCase();
        return special === targetSpecial;
      });
      if (match && match.path) return match.path;
    }

    // Pattern matching by path and name
    const patterns: Record<SupportedFolder, RegExp[]> = {
      inbox: [/^inbox$/i],
      sent: [/sent/i, /enviad/i, /itens enviados/i, /caixa de sa[ií]da/i],
      drafts: [/draft/i, /rascunho/i, /rascunh/i],
      trash: [/trash/i, /lixeira/i, /itens exclu/i, /excluid/i, /deleted/i, /lixo/i],
      junk: [/junk/i, /spam/i, /mala_direta/i, /mala direta/i, /quarentena/i, /eletr[oô]nico/i],
      archive: [/archive/i, /arquivo/i, /arquiv/i, /todos/i],
    };

    const regexList = patterns[folder] || [];
    for (const regex of regexList) {
      const match = mailboxes.find((m) => {
        if (m.flags && (m.flags.has('\\Noselect') || m.flags.has('\\NonExistent'))) {
          return false;
        }
        return regex.test(m.path || '') || regex.test(m.name || '');
      });
      if (match && match.path) return match.path;
    }

    return null;
  }

  /**
   * Identifica se um anexo é na verdade uma imagem de assinatura digital ou inline
   */
  private static isSignatureOrInlineAttachment(att: any, bodyHtml?: string): boolean {
    const filename = (att.filename || att.name || '').trim();
    const contentType = (att.contentType || '').toLowerCase();
    const isImage =
      contentType.startsWith('image/') ||
      /\.(png|jpe?g|gif|bmp|webp|ico)$/i.test(filename);

    if (!isImage) return false;

    if (att.related || att.contentDisposition === 'inline' || att.isSignature || att.isInline) {
      return true;
    }
    if (att.cid && bodyHtml && bodyHtml.includes(att.cid)) {
      return true;
    }
    if (
      filename &&
      bodyHtml &&
      (bodyHtml.includes(filename) || bodyHtml.includes(encodeURIComponent(filename)))
    ) {
      return true;
    }
    const size = att.size || (att.content ? att.content.length : 0);
    const isSmallImage = size < 350 * 1024;
    const outlookAutoImagePattern = /^image\d{3,4}\.(png|jpe?g|gif|bmp|webp)$/i;
    if (outlookAutoImagePattern.test(filename) && isSmallImage) {
      return true;
    }
    const signatureNamePattern =
      /^(signature|assinatura|logo|logotipo|banner|footer|rodape|header|cabecalho|stamp|selo|social|icon_?|icone_?|whatsapp|facebook|linkedin|instagram|twitter|yt|youtube|badge)\w*\.(png|jpe?g|gif|webp|svg)$/i;
    if (signatureNamePattern.test(filename) && isSmallImage) {
      return true;
    }
    return false;
  }

  /**
   * Grava anexo baixado em cache local de dados do usuário
   */
  private static saveAttachmentCache(
    messageId: string,
    att: any,
    index: number,
    bodyHtml?: string
  ): { id: string; name: string; size: number; contentType: string; path?: string; isSignature?: boolean } {
    const attId = `att-${messageId}-${index}`;
    const isSignature = this.isSignatureOrInlineAttachment(att, bodyHtml);
    try {
      const attachmentsBaseDir = path.join(
        getDataStorageDir(),
        'attachments',
        messageId.replace(/[^a-zA-Z0-9_-]/g, '_')
      );
      if (!fs.existsSync(attachmentsBaseDir)) {
        fs.mkdirSync(attachmentsBaseDir, { recursive: true });
      }
      const safeFilename = (att.filename || `anexo-${index + 1}`).replace(/[\\/:*?"<>|]/g, '_');
      const filePath = path.join(attachmentsBaseDir, safeFilename);
      if (att.content && Buffer.isBuffer(att.content)) {
        fs.writeFileSync(filePath, att.content);
      }
      return {
        id: attId,
        name: att.filename || `anexo-${index + 1}`,
        size: att.size || (att.content ? att.content.length : 0),
        contentType: att.contentType || 'application/octet-stream',
        path: filePath,
        isSignature,
      };
    } catch (err) {
      console.warn('[MAIL SERVICE] Falha ao gravar anexo em cache:', err);
      return {
        id: attId,
        name: att.filename || `anexo-${index + 1}`,
        size: att.size || 0,
        contentType: att.contentType || 'application/octet-stream',
        isSignature,
      };
    }
  }

  /**
   * Faz o download sob demanda de um anexo específico via IMAP (usado quando o cache local está corrompido/truncado).
   */
  public static async redownloadImapAttachment(
    config: MailServerConfig,
    folderOrPath: string,
    uid: number,
    targetFilename: string,
    destFilePath: string
  ): Promise<boolean> {
    if (config.protocol === 'pop3' || !config.host || !config.user || (!config.pass && !config.accessToken)) {
      return false;
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: !isTlsHostTrusted(config.host) },
      logger: false,
    });
    client.on('error', () => {});

    try {
      await client.connect();
      const mailboxes = await client.list();
      const systemFolders: SupportedFolder[] = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'];
      let mailboxPath: string | null = null;

      if (systemFolders.includes(folderOrPath as SupportedFolder)) {
        mailboxPath =
          this.findServerMailbox(mailboxes, folderOrPath as SupportedFolder) ||
          (folderOrPath === 'inbox' ? 'INBOX' : null);
      } else {
        const cleanTarget = folderOrPath.startsWith('imap:') ? folderOrPath.slice(5) : folderOrPath;
        const normalized = cleanTarget.replace(/_/g, '/');
        const match = mailboxes.find(
          (m: any) =>
            !(m.flags && (m.flags.has('\\Noselect') || m.flags.has('\\NonExistent'))) &&
            (m.path === cleanTarget ||
              m.name === cleanTarget ||
              m.path.replace(/[\\/:*?"<>|.\s-]/g, '_') === cleanTarget.replace(/[\\/:*?"<>|.\s-]/g, '_') ||
              m.path === normalized)
        );
        mailboxPath = match?.path || cleanTarget;
      }

      if (!mailboxPath) {
        await client.logout();
        return false;
      }

      const lock = await client.getMailboxLock(mailboxPath);
      let saved = false;
      try {
        const msg = await client.fetchOne(
          String(uid),
          { source: true },
          { uid: true }
        );
        if (msg && (msg as any).source) {
          const parsed: any = await simpleParser((msg as any).source);
          if (parsed.attachments && Array.isArray(parsed.attachments)) {
            const normTarget = targetFilename.replace(/[\\/:*?"<>|]/g, '_').toLowerCase();
            const att =
              parsed.attachments.find(
                (a: any) =>
                  (a.filename || '').replace(/[\\/:*?"<>|]/g, '_').toLowerCase() === normTarget
              ) ||
              parsed.attachments.find((a: any) =>
                (a.filename || '').toLowerCase().endsWith(path.extname(targetFilename).toLowerCase())
              ) ||
              parsed.attachments[0];

            if (att && att.content && Buffer.isBuffer(att.content)) {
              const dir = path.dirname(destFilePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(destFilePath, att.content);
              saved = true;
            }
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
      return saved;
    } catch (err: any) {
      console.warn('[IMAP] Falha ao rebaixar anexo completo:', err?.message || err);
      try {
        await client.logout();
      } catch {}
      return false;
    }
  }

  /**
   * Helper to parse IMAP message into app EmailItem structure
   */
  private static async formatImapMessage(
    message: any,
    folder: string,
    config: MailServerConfig
  ): Promise<any> {
    const env = message.envelope || {};
    const senderName = env.from?.[0]?.name || env.from?.[0]?.address || 'Remetente Desconhecido';
    const senderEmail = env.from?.[0]?.address || '';
    const subject = env.subject || '(Sem Assunto)';
    const date = env.date
      ? new Date(env.date)
      : message.internalDate
      ? new Date(message.internalDate)
      : new Date();
    const isUnread = !message.flags?.has('\\Seen');
    const isStarred = Boolean(message.flags?.has('\\Flagged'));
    const messageId = `imap-${folder}-${message.uid}`;

    let bodyText = '';
    let bodyHtml: string | undefined = undefined;
    let snippet = '';
    let hasAttachment = false;
    let attachmentsList: any[] = [];
    let messageIdHeader: string | undefined = env.messageId || undefined;
    let inReplyToHeader: string | undefined = env.inReplyTo || undefined;
    let referencesHeader: string[] = [];
    let readReceiptRequestedBy: string | undefined = undefined;
    let parsedCc: string | undefined = undefined;
    let calendarInvite: any = undefined;
    let listHeaders: { listUnsubscribe?: string; listUnsubscribePost?: string; listId?: string; precedence?: string } = {};

    if (message.source) {
      try {
        const parsed: any = await simpleParser(message.source);
        const textContent = parsed.text || '';
        const rawHtmlContent = parsed.html || '';
        const htmlContent =
          rawHtmlContent && Array.isArray(parsed.attachments)
            ? resolveCidImagesInHtml(rawHtmlContent, parsed.attachments)
            : rawHtmlContent;
        bodyHtml = htmlContent || undefined;
        bodyText = textContent || (htmlContent ? htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
        snippet = bodyText.slice(0, 120);

        if (parsed.messageId) {
          messageIdHeader = String(parsed.messageId).trim();
        }
        if (parsed.inReplyTo) {
          inReplyToHeader = String(parsed.inReplyTo).trim();
        }
        if (parsed.references) {
          referencesHeader = parseReferencesHeader(parsed.references);
        }
        parsedCc = formatParsedAddressField(parsed.cc);
        readReceiptRequestedBy = extractReadReceiptAddress(parsed.headers, senderEmail);
        calendarInvite = extractCalendarInviteFromParsed(parsed);
        listHeaders = extractListHeaders(parsed.headers);

        if (parsed.attachments && Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
          attachmentsList = parsed.attachments.map((att: any, idx: number) =>
            this.saveAttachmentCache(messageId, att, idx, htmlContent)
          );
          hasAttachment = attachmentsList.some((a) => !a.isSignature);
        }
      } catch (parseErr) {
        console.warn('[MAIL SERVICE] Erro no simpleParser:', parseErr);
      }
    }

    if (!bodyText) {
      bodyText = `De: ${senderName} <${senderEmail}>\nPara: ${env.to?.[0]?.address || config.user}\nData: ${date.toLocaleString('pt-BR')}\nAssunto: ${subject}\n\n[Mensagem sincronizada via IMAP da pasta ${folder.toUpperCase()} do servidor ${config.host}]`;
      snippet = subject;
    }

    // Compute period
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const lastWeekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    let period: 'today' | 'yesterday' | 'last_week' | 'older' = 'older';
    if (date >= todayStart) period = 'today';
    else if (date >= yesterdayStart) period = 'yesterday';
    else if (date >= lastWeekStart) period = 'last_week';

    const timeStr =
      date >= todayStart
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date >= yesterdayStart
        ? 'Ontem'
        : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    const folderTagMap: Record<string, string> = {
      inbox: 'Entrada',
      sent: 'Enviado',
      drafts: 'Rascunho',
      trash: 'Lixeira',
      junk: 'Spam',
      archive: 'Arquivo',
    };

    const folderTag = folderTagMap[folder] || (folder.startsWith('imap:') ? folder.slice(5).split(/[/.]/).pop() || folder : folder);
    const allRecipients = Array.isArray(env.to) && env.to.length > 0
      ? env.to.map((t: any) => (t.name ? `${t.name} <${t.address}>` : t.address)).filter(Boolean).join(', ')
      : env.to?.[0]?.address || config.user;
    const allCc =
      parsedCc ||
      (Array.isArray(env.cc) && env.cc.length > 0
        ? env.cc.map((c: any) => (c.name ? `${c.name} <${c.address}>` : c.address)).filter(Boolean).join(', ')
        : undefined);

    return {
      id: messageId,
      messageIdHeader,
      inReplyToHeader,
      referencesHeader: referencesHeader.length > 0 ? referencesHeader : undefined,
      readReceiptRequestedBy,
      sender: senderName,
      senderEmail: senderEmail,
      avatar: '',
      recipient: allRecipients,
      cc: allCc || undefined,
      subject: subject,
      snippet: snippet || subject,
      body: bodyText,
      bodyHtml: bodyHtml,
      attachments: attachmentsList.length > 0 ? attachmentsList : undefined,
      timestamp: timeStr,
      dateStr: date.toISOString(),
      // Data em que o servidor recebeu a mensagem (INTERNALDATE) e tamanho — usados na ordenação
      receivedDateStr: (() => {
        const d = message.internalDate ? new Date(message.internalDate) : null;
        return d && !isNaN(d.getTime()) ? d.toISOString() : undefined;
      })(),
      sizeBytes:
        typeof message.size === 'number' && message.size > 0
          ? message.size
          : message.source
          ? message.source.length
          : undefined,
      period: period,
      folder: folder,
      priority: 'medium',
      isRead: !isUnread,
      isStarred: isStarred,
      hasAttachment: hasAttachment,
      tags: ['IMAP', folderTag],
      calendarInvite: calendarInvite || undefined,
      listUnsubscribe: listHeaders.listUnsubscribe,
      listUnsubscribePost: listHeaders.listUnsubscribePost,
      listId: listHeaders.listId,
      precedence: listHeaders.precedence,
    };
  }

  /**
   * Fetch messages from a specific folder via IMAP
   */
  public static async fetchFolderMessages(
    config: MailServerConfig,
    targetFolder: string = 'inbox',
    limit: number = 25,
    imapPathOverride?: string
  ): Promise<FetchResult> {
    if (!config.host || !config.user || (!config.pass && !config.accessToken)) {
      return {
        success: false,
        error: 'Credenciais de e-mail não configuradas.',
      };
    }

    if (config.protocol === 'pop3') {
      if (targetFolder === 'inbox') {
        return await this.fetchPop3Inbox(config);
      }
      return {
        success: true,
        emails: [],
        count: 0,
      };
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: {
        rejectUnauthorized: !isTlsHostTrusted(config.host),
      },
      logger: false,
    });
    client.on('error', (err: any) => {
      console.warn('[IMAP] Erro assíncrono no socket IMAP (fetchFolderMessages):', err?.message || err);
    });

    try {
      await client.connect();
      let quotaInfo: QuotaInfo | undefined;
      try {
        const q: any = await client.getQuota('INBOX');
        if (q && q.storage && typeof q.storage.usage === 'number') {
          quotaInfo = {
            usedBytes: q.storage.usage,
            limitBytes: typeof q.storage.limit === 'number' ? q.storage.limit : 0,
          };
        }
      } catch {
        // Servidor IMAP não suporta GETQUOTAROOT ou falhou silenciosamente
      }

      const mailboxes = await client.list();
      const systemFolders: SupportedFolder[] = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'];
      let mailboxPath: string | null = imapPathOverride || null;
      if (!mailboxPath) {
        if (systemFolders.includes(targetFolder as SupportedFolder)) {
          mailboxPath =
            this.findServerMailbox(mailboxes, targetFolder as SupportedFolder) ||
            (targetFolder === 'inbox' ? 'INBOX' : null);
        } else {
          const cleanTarget = targetFolder.startsWith('imap:') ? targetFolder.slice(5) : targetFolder;
          const match = mailboxes.find(
            (m: any) =>
              !(m.flags && (m.flags.has('\\Noselect') || m.flags.has('\\NonExistent'))) &&
              (m.path === cleanTarget || m.name === cleanTarget)
          );
          mailboxPath = match?.path || null;
        }
      }

      if (!mailboxPath) {
        await client.logout();
        return {
          success: true,
          emails: [],
          count: 0,
          quota: quotaInfo,
        };
      }

      const lock = await client.getMailboxLock(mailboxPath);
      const messages: any[] = [];
      let serverTotal = 0;

      try {
        const total = client.mailbox ? client.mailbox.exists : 0;
        serverTotal = total;
        if (total > 0) {
          const startIdx = limit <= 0 ? 1 : Math.max(1, total - limit + 1);
          const range = `${startIdx}:${total}`;

            for await (const message of client.fetch(range, {
              envelope: true,
              flags: true,
              bodyStructure: true,
              uid: true,
              size: true,
              internalDate: true,
              source: true,
            })) {
              try {
                const formatted = await this.formatImapMessage(message, targetFolder, config);
                messages.push(formatted);
              } catch (formatErr: any) {
                console.warn(`[IMAP] Erro ao formatar mensagem UID ${message?.uid}:`, formatErr?.message);
              }
            }

            // Ordena sempre decrescente por data/hora (mais recente no topo)
            messages.sort((a, b) => {
              const timeA = a.dateStr ? new Date(a.dateStr).getTime() : 0;
              const timeB = b.dateStr ? new Date(b.dateStr).getTime() : 0;
              return timeB - timeA;
            });
        }
      } finally {
        lock.release();
      }

      await client.logout();
      return {
        success: true,
        emails: messages,
        count: messages.length,
        serverTotal,
        quota: quotaInfo,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erro ao sincronizar pasta ${targetFolder} via IMAP: ${err.message}`,
      };
    }
  }

  /**
   * Busca um lote de mensagens mais antigas de uma pasta IMAP (paginação / backfill completo).
   */
  public static async fetchOlderFolderMessages(
    config: MailServerConfig,
    targetFolder: string,
    options?: {
      offset?: number;
      batchSize?: number;
      imapPath?: string;
      knownUids?: number[];
      /**
       * true = ignora o offset e baixa apenas as mensagens que faltam localmente
       * (lista real de UIDs do servidor menos knownUids), das mais novas para as mais antigas.
       * Não depende da posição na pasta, então lacunas no meio também são preenchidas.
       */
      missingOnly?: boolean;
    }
  ): Promise<FetchResult> {
    if (config.protocol === 'pop3') {
      return this.fetchPop3Inbox(config);
    }

    const offset = Math.max(0, options?.offset ?? 0);
    const batchSize = Math.max(10, Math.min(options?.batchSize ?? 150, 500));
    const knownUids = new Set<number>(options?.knownUids || []);

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: {
        rejectUnauthorized: !isTlsHostTrusted(config.host),
      },
      logger: false,
    });
    client.on('error', (err: any) => {
      console.warn('[IMAP] Erro assíncrono no socket IMAP (fetchOlderFolderMessages):', err?.message || err);
    });

    try {
      await client.connect();
      const mailboxes = await client.list();
      const systemFolders: SupportedFolder[] = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'];
      let mailboxPath: string | null = options?.imapPath || null;

      if (!mailboxPath) {
        if (systemFolders.includes(targetFolder as SupportedFolder)) {
          mailboxPath =
            this.findServerMailbox(mailboxes, targetFolder as SupportedFolder) ||
            (targetFolder === 'inbox' ? 'INBOX' : null);
        } else {
          const cleanTarget = targetFolder.startsWith('imap:') ? targetFolder.slice(5) : targetFolder;
          const match = mailboxes.find(
            (m: any) =>
              !(m.flags && (m.flags.has('\\Noselect') || m.flags.has('\\NonExistent'))) &&
              (m.path === cleanTarget || m.name === cleanTarget)
          );
          mailboxPath = match?.path || null;
        }
      }

      if (!mailboxPath) {
        await client.logout();
        return { success: true, emails: [], count: 0, serverTotal: 0, hasMore: false };
      }

      const lock = await client.getMailboxLock(mailboxPath);
      let serverTotal = 0;
      let startIdx = 1;
      let fetchedMessages: any[] = [];
      const flagUpdates: Array<{ id: string; isRead: boolean; isStarred: boolean }> = [];

      if (options?.missingOnly) {
        let attemptedUids: number[] = [];
        let remaining = 0;
        try {
          serverTotal = client.mailbox ? client.mailbox.exists : 0;
          if (serverTotal > 0) {
            // Lista completa (sem o limite de 10.000 resultados da busca de alguns provedores)
            const allUids = (await this.listServerUids(client)).uids;
            const missing = allUids.filter((uid) => !knownUids.has(uid)).sort((a, b) => b - a);
            attemptedUids = missing.slice(0, batchSize);
            remaining = missing.length - attemptedUids.length;

            if (attemptedUids.length > 0) {
              for await (const message of client.fetch(
                attemptedUids.join(','),
                { envelope: true, flags: true, bodyStructure: true, uid: true, size: true, internalDate: true, source: true },
                { uid: true }
              )) {
                try {
                  fetchedMessages.push(await this.formatImapMessage(message, targetFolder, config));
                } catch (formatErr: any) {
                  console.warn(
                    `[IMAP] Erro ao formatar mensagem UID ${message?.uid} em ${targetFolder}:`,
                    formatErr?.message
                  );
                }
              }
            }
          }
        } finally {
          lock.release();
        }
        await client.logout();

        fetchedMessages.sort((a, b) => {
          const timeA = a.dateStr ? new Date(a.dateStr).getTime() : 0;
          const timeB = b.dateStr ? new Date(b.dateStr).getTime() : 0;
          return timeB - timeA;
        });

        return {
          success: true,
          emails: fetchedMessages,
          count: fetchedMessages.length,
          serverTotal,
          hasMore: remaining > 0,
          attemptedUids,
          remaining,
          mailboxPath,
        };
      }

      try {
        serverTotal = client.mailbox ? client.mailbox.exists : 0;
        const endIdx = serverTotal - offset;
        if (serverTotal > 0 && endIdx >= 1) {
          startIdx = Math.max(1, endIdx - batchSize + 1);
          const range = `${startIdx}:${endIdx}`;
          const res = await this.fetchFolderIncremental(
            client,
            range,
            targetFolder,
            config,
            knownUids,
            flagUpdates
          );
          fetchedMessages = res.messages;
        }
      } finally {
        lock.release();
      }

      await client.logout();

      fetchedMessages.sort((a, b) => {
        const timeA = a.dateStr ? new Date(a.dateStr).getTime() : 0;
        const timeB = b.dateStr ? new Date(b.dateStr).getTime() : 0;
        return timeB - timeA;
      });

      return {
        success: true,
        emails: fetchedMessages,
        count: fetchedMessages.length,
        serverTotal,
        hasMore: startIdx > 1,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erro ao carregar mensagens antigas da pasta ${targetFolder}: ${err.message}`,
      };
    }
  }

  /**
   * Fetches only new messages (by UID) with full MIME source, while collecting flag updates
   * for already-cached UIDs without re-downloading their full source.
   */
  private static async fetchFolderIncremental(
    client: ImapFlow,
    range: string,
    folderKey: string,
    config: MailServerConfig,
    knownUids: Set<number>,
    flagUpdates: Array<{ id: string; isRead: boolean; isStarred: boolean }>
  ): Promise<{ messages: any[]; bytesCount: number }> {
    const messages: any[] = [];
    let bytesCount = 0;

    if (knownUids.size > 0) {
      const newUids: number[] = [];
      for await (const meta of client.fetch(range, { uid: true, flags: true, size: true })) {
        if (typeof (meta as any).size === 'number') {
          bytesCount += (meta as any).size;
        }
        const uid = Number((meta as any).uid);
        if (!Number.isFinite(uid)) continue;
        if (knownUids.has(uid)) {
          flagUpdates.push({
            id: `imap-${folderKey}-${uid}`,
            isRead: Boolean(meta.flags?.has('\\Seen')),
            isStarred: Boolean(meta.flags?.has('\\Flagged')),
          });
        } else {
          newUids.push(uid);
        }
      }

      if (newUids.length === 0) {
        return { messages, bytesCount };
      }

      for await (const message of client.fetch(
        newUids.join(','),
        {
          envelope: true,
          flags: true,
          bodyStructure: true,
          uid: true,
          size: true,
          internalDate: true,
          source: true,
        },
        { uid: true }
      )) {
        try {
          const formatted = await this.formatImapMessage(message, folderKey, config);
          messages.push(formatted);
        } catch (formatErr: any) {
          console.warn(`[IMAP] Erro ao formatar mensagem UID ${message?.uid} em ${folderKey}:`, formatErr?.message);
        }
      }
      return { messages, bytesCount };
    }

    for await (const message of client.fetch(range, {
      envelope: true,
      flags: true,
      bodyStructure: true,
      uid: true,
      size: true,
      internalDate: true,
      source: true,
    })) {
      if (typeof (message as any).size === 'number') {
        bytesCount += (message as any).size;
      }
      try {
        const formatted = await this.formatImapMessage(message, folderKey, config);
        messages.push(formatted);
      } catch (formatErr: any) {
        console.warn(`[IMAP] Erro ao formatar mensagem UID ${message?.uid}:`, formatErr?.message);
      }
    }

    return { messages, bytesCount };
  }

  /**
   * Full IMAP Multi-Folder Synchronization:
   * Synchronizes Inbox, Sent, Drafts, Trash, Junk, Archive from the IMAP server
   */
  public static async syncAllFolders(
    config: MailServerConfig,
    limitPerFolder: number = 150
  ): Promise<FetchResult & { folderStats?: Record<string, number> }> {
    if (!config.host || !config.user || (!config.pass && !config.accessToken)) {
      return {
        success: false,
        error: 'Credenciais de e-mail não configuradas.',
      };
    }

    if (config.protocol === 'pop3') {
      const pop3Res = await this.fetchPop3Inbox(config);
      return {
        ...pop3Res,
        folderStats: { inbox: pop3Res.count || 0 },
      };
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: {
        rejectUnauthorized: !isTlsHostTrusted(config.host),
      },
      logger: false,
    });
    client.on('error', (err: any) => {
      console.warn('[IMAP] Erro assíncrono no socket IMAP (fetchFolderMessages):', err?.message || err);
    });

    try {
      await client.connect();
      let quotaInfo: QuotaInfo | undefined;
      try {
        const q: any = await client.getQuota('INBOX');
        if (q && q.storage && typeof q.storage.usage === 'number') {
          quotaInfo = {
            usedBytes: q.storage.usage,
            limitBytes: typeof q.storage.limit === 'number' ? q.storage.limit : 0,
          };
        }
      } catch {
        // Servidor não suporta QUOTA
      }

      const mailboxes = await client.list();

      const inboxOnly = Boolean((config as any).inboxOnly);
      const foldersToSync: SupportedFolder[] = inboxOnly
        ? ['inbox']
        : ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'];
      const allMessages: any[] = [];
      const flagUpdates: Array<{ id: string; isRead: boolean; isStarred: boolean }> = [];
      const folderStats: Record<string, number> = {};
      const serverTotals: Record<string, number> = {};
      const systemPathToFolder = new Map<string, SupportedFolder>();
      const discoveredCustomFolders: DiscoveredCustomFolder[] = [];
      const knownUidsByFolder = config.knownUidsByFolder || {};
      const catchUpPending: Record<string, number> = {};
      const vanishedByFolder: Record<string, number[]> = {};
      const syncDiag: string[] = [];
      let fallbackUsedBytes = 0;

      for (const folder of foldersToSync) {
        const mailboxPath = this.findServerMailbox(mailboxes, folder) || (folder === 'inbox' ? 'INBOX' : null);
        if (!mailboxPath) {
          folderStats[folder] = 0;
          continue;
        }
        systemPathToFolder.set(mailboxPath.toLowerCase(), folder);

        try {
          const lock = await client.getMailboxLock(mailboxPath);
          let folderMessages: any[] = [];

          try {
            const total = client.mailbox ? client.mailbox.exists : 0;
            serverTotals[folder] = total;
            if (total > 0) {
              const effectiveLimit =
                limitPerFolder <= 0
                  ? total
                  : folder === 'inbox'
                  ? Math.max(limitPerFolder, 200)
                  : limitPerFolder;
              const startIdx = Math.max(1, total - effectiveLimit + 1);
              const range = `${startIdx}:${total}`;
              const knownUids = new Set<number>(knownUidsByFolder[folder] || []);
              const res = await this.fetchFolderIncremental(
                client,
                range,
                folder,
                config,
                knownUids,
                flagUpdates
              );
              folderMessages = res.messages;
              fallbackUsedBytes += res.bytesCount;

              // Recuperação automática: mensagens novas (ou lacunas) mais recentes que a mais antiga
              // já baixada, mas que ficaram fora da janela acima (ex.: app fechado por dias com
              // centenas de e-mails novos). O histórico mais antigo continua sendo dos botões.
              if (limitPerFolder > 0 && knownUids.size > 0) {
                const catchUp = await this.fetchSyncCatchUp(client, folder, config, knownUids, folderMessages);
                if (catchUp.messages.length > 0) folderMessages.push(...catchUp.messages);
                if (catchUp.remaining > 0) catchUpPending[folder] = catchUp.remaining;
                if (catchUp.vanished.length > 0) vanishedByFolder[folder] = catchUp.vanished;
                if (catchUp.diag) syncDiag.push(catchUp.diag);
              }
            } else if (total === 0 && (knownUidsByFolder[folder] || []).length > 0) {
              // Pasta esvaziada no servidor: tudo o que o app tinha nela saiu do servidor
              const allKnown = [...(knownUidsByFolder[folder] || [])];
              if (allKnown.length <= this.MAX_VANISHED_PER_SYNC) vanishedByFolder[folder] = allKnown;
              else syncDiag.push(`${folder} [pasta "${mailboxPath}"]: servidor diz 0 mensagens, app conhece ${allKnown.length} — NADA removido nesta rodada`);
            }
          } finally {
            lock.release();
          }

          // Ordena rigorosamente as mensagens da pasta por data decrescente (mais recente primeiro)
          folderMessages.sort((a, b) => {
            const timeA = a.dateStr ? new Date(a.dateStr).getTime() : 0;
            const timeB = b.dateStr ? new Date(b.dateStr).getTime() : 0;
            return timeB - timeA;
          });

          folderStats[folder] = folderMessages.length;
          allMessages.push(...folderMessages);
        } catch (folderErr: any) {
          console.warn(`[IMAP] Falha ao sincronizar pasta ${folder} (${mailboxPath}):`, folderErr.message);
          folderStats[folder] = 0;
        }
      }

      // Descobre e sincroniza pastas personalizadas / subpastas no servidor IMAP
      const customMailboxes = mailboxes.filter((m: any) => {
        if (inboxOnly) return false; // sincronização rápida: apenas Caixa de Entrada
        if (!m?.path) return false;
        if (m.flags && (m.flags.has('\\Noselect') || m.flags.has('\\NonExistent'))) {
          return false;
        }
        const lowerPath = m.path.toLowerCase();
        if (lowerPath === 'inbox' || systemPathToFolder.has(lowerPath)) {
          return false;
        }
        return true;
      });

      for (const m of customMailboxes) {
        const delimiter = m.delimiter || (m.path.includes('/') ? '/' : m.path.includes('.') ? '.' : '/');
        const parentPathRaw =
          typeof m.parentPath === 'string' && m.parentPath.length > 0
            ? m.parentPath
            : m.path.includes(delimiter)
            ? m.path.slice(0, m.path.lastIndexOf(delimiter))
            : '';
        const parentSystemFolder = parentPathRaw
          ? systemPathToFolder.get(parentPathRaw.toLowerCase()) ||
            (parentPathRaw.toLowerCase() === 'inbox' ? 'inbox' : undefined)
          : undefined;

        discoveredCustomFolders.push({
          imapPath: m.path,
          name: m.name || m.path.split(delimiter).pop() || m.path,
          parentImapPath: parentPathRaw && !parentSystemFolder ? parentPathRaw : undefined,
          parentSystemFolder,
          delimiter,
        });

        try {
          const lock = await client.getMailboxLock(m.path);
          let customMessages: any[] = [];
          try {
            const total = client.mailbox ? client.mailbox.exists : 0;
            serverTotals[`imap:${m.path}`] = total;
            if (total > 0) {
              const effectiveLimit = limitPerFolder <= 0 ? total : Math.min(limitPerFolder, 100);
              const startIdx = Math.max(1, total - effectiveLimit + 1);
              const range = `${startIdx}:${total}`;
              const folderKey = `imap:${m.path}`;
              const knownUids = new Set<number>(knownUidsByFolder[folderKey] || []);
              const res = await this.fetchFolderIncremental(
                client,
                range,
                folderKey,
                config,
                knownUids,
                flagUpdates
              );
              customMessages = res.messages;

              // Recuperação automática também nas pastas personalizadas
              if (limitPerFolder > 0 && knownUids.size > 0) {
                const catchUp = await this.fetchSyncCatchUp(client, folderKey, config, knownUids, customMessages);
                if (catchUp.messages.length > 0) customMessages.push(...catchUp.messages);
                if (catchUp.remaining > 0) catchUpPending[folderKey] = catchUp.remaining;
                if (catchUp.vanished.length > 0) vanishedByFolder[folderKey] = catchUp.vanished;
                if (catchUp.diag) syncDiag.push(catchUp.diag);
              }
            } else if (total === 0 && (knownUidsByFolder[`imap:${m.path}`] || []).length > 0) {
              const allKnownCustom = [...(knownUidsByFolder[`imap:${m.path}`] || [])];
              if (allKnownCustom.length <= this.MAX_VANISHED_PER_SYNC) vanishedByFolder[`imap:${m.path}`] = allKnownCustom;
              else syncDiag.push(`imap:${m.path}: servidor diz 0 mensagens, app conhece ${allKnownCustom.length} — NADA removido nesta rodada`);
            }
          } finally {
            lock.release();
          }

          customMessages.sort((a, b) => {
            const timeA = a.dateStr ? new Date(a.dateStr).getTime() : 0;
            const timeB = b.dateStr ? new Date(b.dateStr).getTime() : 0;
            return timeB - timeA;
          });

          folderStats[`imap:${m.path}`] = customMessages.length;
          allMessages.push(...customMessages);
        } catch (customErr: any) {
          console.warn(`[IMAP] Falha ao sincronizar pasta personalizada ${m.path}:`, customErr?.message);
        }
      }

      if (!quotaInfo && fallbackUsedBytes > 0) {
        quotaInfo = {
          usedBytes: fallbackUsedBytes,
          limitBytes: 0,
        };
      }

      await client.logout();

      return {
        success: true,
        emails: allMessages,
        count: allMessages.length,
        folderStats: folderStats,
        serverTotals,
        customFolders: discoveredCustomFolders,
        // Lista completa de pastas que existem no servidor (para o app saber quais foram apagadas).
        // Ausente na sincronização rápida (só Caixa de Entrada).
        serverFolderPaths: inboxOnly ? undefined : mailboxes.map((m: any) => m?.path).filter(Boolean),
        quota: quotaInfo,
        flagUpdates: flagUpdates.length > 0 ? flagUpdates : undefined,
        catchUpPending: Object.keys(catchUpPending).length > 0 ? catchUpPending : undefined,
        vanished: Object.keys(vanishedByFolder).length > 0 ? vanishedByFolder : undefined,
        diag: syncDiag.length > 0 ? syncDiag : undefined,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erro ao sincronizar pastas IMAP: ${err.message}`,
      };
    }
  }

  /** Máximo de mensagens recuperadas por pasta em cada sincronização (o restante vem nas seguintes). */
  private static readonly SYNC_CATCHUP_BATCH = 300;

  /**
   * Recuperação automática da sincronização: busca as mensagens do servidor mais recentes que a
   * mais antiga já baixada (UID >= menor UID conhecido) que ainda não existem no app e que não
   * vieram na janela normal — e-mails novos acima do limite da janela e lacunas. Mais novas primeiro.
   * Deve ser chamada com a pasta já selecionada (dentro do mailbox lock).
   */
  /**
   * Lista os UIDs da pasta aberta no servidor.
   *
   * NÃO usa SEARCH: alguns provedores (ex.: Yahoo) devolvem no máximo 10.000 resultados por busca,
   * e o restante parecia "apagado no servidor" — o app removia e baixava de novo, em loop.
   * Usa FETCH dos UIDs (sem esse limite) e confere com o total da pasta.
   *
   * complete = a lista bate com o total de mensagens da pasta (só então é seguro concluir que
   * algo foi apagado no servidor).
   */
  private static async listServerUids(client: ImapFlow): Promise<{ uids: number[]; complete: boolean }> {
    const exists = client.mailbox ? client.mailbox.exists : 0;
    if (!exists) return { uids: [], complete: true };
    const uids: number[] = [];
    for await (const msg of client.fetch('1:*', { uid: true })) {
      const uid = Number(msg?.uid);
      if (Number.isFinite(uid)) uids.push(uid);
    }
    const unique = Array.from(new Set(uids));
    return { uids: unique, complete: unique.length === exists };
  }

  /** Acima disso, "removidas no servidor" numa única pasta/rodada é tratado como suspeito. */
  private static readonly MAX_VANISHED_PER_SYNC = 300;
  /** Alguns provedores (ex.: Yahoo) mostram no máximo 10.000 mensagens por pasta via IMAP. */
  private static readonly PROVIDER_FOLDER_VIEW_CAP = 10000;

  private static async fetchSyncCatchUp(
    client: ImapFlow,
    folderKey: string,
    config: MailServerConfig,
    knownUids: Set<number>,
    alreadyFetched: any[]
  ): Promise<{ messages: any[]; remaining: number; vanished: number[]; diag?: string }> {
    const messages: any[] = [];
    let vanished: number[] = [];
    let diag: string | undefined;
    try {
      let minKnown = Number.POSITIVE_INFINITY;
      for (const uid of knownUids) if (uid < minKnown) minKnown = uid;
      if (!Number.isFinite(minKnown)) return { messages, remaining: 0, vanished };

      const fetchedNow = new Set<number>();
      for (const m of alreadyFetched) {
        const uid = Number(String(m?.id ?? '').split('-').pop());
        if (Number.isFinite(uid)) fetchedNow.add(uid);
      }

      const listed = await this.listServerUids(client);
      const serverUids = new Set(listed.uids.filter((uid) => uid >= minKnown));

      // Servidor → app: mensagens que o app conhece mas não existem mais nesta pasta do servidor
      // (apagadas ou movidas no webmail/celular/outro cliente). Só quando a lista do servidor está
      // completa — nunca remover do app com base numa lista parcial.
      const exists = client.mailbox ? client.mailbox.exists : 0;
      const span = (arr: number[]) => {
        if (arr.length === 0) return '-';
        let lo = arr[0];
        let hi = arr[0];
        for (const v of arr) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        return `${lo}..${hi}`;
      };
      // Provedores que mostram no máximo 10.000 mensagens por pasta via IMAP (ex.: Yahoo): o que
      // está acima do maior UID visível não foi apagado — só não aparece. Nesses casos, só conta
      // como removido o que estiver dentro da faixa visível.
      let listedMax = 0;
      for (const uid of listed.uids) if (uid > listedMax) listedMax = uid;
      const truncatedView = listed.complete && exists >= this.PROVIDER_FOLDER_VIEW_CAP;
      // Pasta no limite do provedor: o provedor escolhe quais mensagens mostra, então não dá para
      // distinguir "apagada" de "escondida" — nesse caso nada é tratado como removido.
      if (listed.complete && !truncatedView) {
        vanished = Array.from(knownUids).filter((uid) => !serverUids.has(uid));
      }
      void listedMax;
      if (!listed.complete || vanished.length > 0 || truncatedView) {
        diag =
          `${folderKey} [pasta "${client.mailbox ? client.mailbox.path : '?'}"]: servidor diz ${exists}, listou ${listed.uids.length} (UIDs ${span(listed.uids)}), ` +
          `app conhece ${knownUids.size} (UIDs ${span(Array.from(knownUids))}), ` +
          `"removidas" ${vanished.length} (UIDs ${span(vanished)})` +
          (listed.complete ? '' : ' — lista incompleta: nada removido') +
          (truncatedView ? ` — servidor mostra só ${exists} mensagens nesta pasta (limite do provedor)` : '');
      }
      // Trava de segurança: remoção em massa numa única rodada não é aplicada (só registrada).
      // Evita o vai-e-vem com provedores que mostram conjuntos diferentes de mensagens.
      if (vanished.length > this.MAX_VANISHED_PER_SYNC) {
        diag = `${diag} — acima de ${this.MAX_VANISHED_PER_SYNC}: NADA removido nesta rodada`;
        vanished = [];
      }

      const missing = Array.from(serverUids)
        .filter((uid) => uid > minKnown && !knownUids.has(uid) && !fetchedNow.has(uid))
        .sort((a, b) => b - a);
      if (missing.length === 0) return { messages, remaining: 0, vanished, diag };

      const batch = missing.slice(0, this.SYNC_CATCHUP_BATCH);
      for await (const message of client.fetch(
        batch.join(','),
        { envelope: true, flags: true, bodyStructure: true, uid: true, size: true, internalDate: true, source: true },
        { uid: true }
      )) {
        try {
          messages.push(await this.formatImapMessage(message, folderKey, config));
        } catch (formatErr: any) {
          console.warn(`[IMAP] Erro ao formatar mensagem UID ${message?.uid} em ${folderKey}:`, formatErr?.message);
        }
      }
      if (batch.length > 0) {
        console.log(
          `[IMAP] Recuperação automática em ${folderKey}: +${messages.length} mensagem(ns), faltam ${missing.length - batch.length}.`
        );
      }
      return { messages, remaining: missing.length - batch.length, vanished, diag };
    } catch (err: any) {
      // Em erro NÃO informa removidas (nunca apagar localmente com base numa consulta que falhou)
      console.warn(`[IMAP] Falha na recuperação automática de ${folderKey}:`, err?.message || err);
      return { messages, remaining: 0, vanished: [] };
    }
  }

  /** Nomes usados para criar pastas de sistema que não existem no servidor. */
  private static readonly DEFAULT_SYSTEM_FOLDER_NAMES: Record<string, string> = {
    sent: 'Sent',
    drafts: 'Drafts',
    trash: 'Trash',
    junk: 'Junk',
    archive: 'Archive',
  };

  private static isRetryableImapError(err: any): boolean {
    const code = String(err?.code || '');
    const msg = String(err?.message || err || '').toLowerCase();
    if (err?.responseStatus === 'NO' || err?.responseStatus === 'BAD') return false;
    return (
      ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'NoConnection'].includes(code) ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('connection') ||
      msg.includes('socket')
    );
  }

  /** Resolve o caminho real da pasta no servidor; cria pastas de sistema ausentes quando pedido. */
  private static async resolveServerMailboxPath(
    client: ImapFlow,
    mailboxes: any[],
    folderKey: string,
    createIfMissing: boolean
  ): Promise<string | null> {
    if (folderKey.startsWith('imap:')) return folderKey.slice(5) || null;
    const systemFolders: SupportedFolder[] = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'];
    if (!systemFolders.includes(folderKey as SupportedFolder)) return null;
    const found = this.findServerMailbox(mailboxes, folderKey as SupportedFolder);
    if (found) return found;
    if (!createIfMissing) return null;
    const name = this.DEFAULT_SYSTEM_FOLDER_NAMES[folderKey];
    if (!name) return null;
    try {
      const created: any = await client.mailboxCreate(name);
      console.log(`[IMAP] Pasta "${name}" criada no servidor para "${folderKey}".`);
      return created?.path || name;
    } catch (err: any) {
      // Já existe com outro atributo/nome equivalente: usa o nome padrão
      if (String(err?.serverResponseCode || '').toUpperCase() === 'ALREADYEXISTS') return name;
      throw err;
    }
  }

  /**
   * Aplica no servidor IMAP as ações feitas no app: marcar lido/não lido e estrela,
   * mover (inclusive para Lixeira, Arquivo e Spam) e excluir definitivamente.
   * Ordem por pasta de origem: flags → mover → excluir.
   */
  public static async applyServerActions(
    config: MailServerConfig,
    actions: ImapServerAction[]
  ): Promise<{ success: boolean; results: ImapServerActionResult[]; error?: string }> {
    const results: ImapServerActionResult[] = [];
    if (!Array.isArray(actions) || actions.length === 0) return { success: true, results };
    if (config.protocol === 'pop3') {
      return {
        success: false,
        results: actions.map((a) => ({ ref: a.ref, ok: false, retry: false, error: 'Conta POP3: ações não são refletidas no servidor.' })),
      };
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: !isTlsHostTrusted(config.host) },
      logger: false,
    });
    client.on('error', (err: any) => {
      console.warn('[IMAP] Erro assíncrono no socket IMAP (applyServerActions):', err?.message || err);
    });

    try {
      await client.connect();
    } catch (err: any) {
      const msg = err?.message || String(err);
      return {
        success: false,
        error: msg,
        results: actions.map((a) => ({ ref: a.ref, ok: false, retry: true, error: msg })),
      };
    }

    try {
      const mailboxes = await client.list();
      const bySource = new Map<string, ImapServerAction[]>();
      for (const action of actions) {
        if (!Number.isFinite(action.uid)) {
          results.push({ ref: action.ref, ok: false, retry: false, error: 'UID inválido.' });
          continue;
        }
        const list = bySource.get(action.folderKey) || [];
        list.push(action);
        bySource.set(action.folderKey, list);
      }

      for (const [sourceKey, group] of bySource) {
        let sourcePath: string | null = null;
        try {
          sourcePath = await this.resolveServerMailboxPath(client, mailboxes, sourceKey, false);
        } catch {
          sourcePath = null;
        }
        if (!sourcePath) {
          for (const a of group) {
            results.push({ ref: a.ref, ok: false, retry: false, error: `Pasta de origem "${sourceKey}" não encontrada no servidor.` });
          }
          continue;
        }

        let lock: any = null;
        try {
          lock = await client.getMailboxLock(sourcePath);

          // 1) Lido / não lido e estrela
          for (const a of group.filter((x) => x.kind === 'flags')) {
            try {
              const uidStr = String(a.uid);
              if (a.seen === true) await client.messageFlagsAdd(uidStr, ['\\Seen'], { uid: true });
              if (a.seen === false) await client.messageFlagsRemove(uidStr, ['\\Seen'], { uid: true });
              if (a.flagged === true) await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true });
              if (a.flagged === false) await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true });
              results.push({ ref: a.ref, ok: true });
            } catch (err: any) {
              results.push({ ref: a.ref, ok: false, retry: this.isRetryableImapError(err), error: err?.message || String(err) });
            }
          }

          // 2) Mover (agrupado por destino)
          const moves = group.filter((x) => x.kind === 'move' && x.toFolderKey && x.toFolderKey !== sourceKey);
          const byDest = new Map<string, ImapServerAction[]>();
          for (const m of moves) {
            const list = byDest.get(m.toFolderKey!) || [];
            list.push(m);
            byDest.set(m.toFolderKey!, list);
          }
          for (const [destKey, destGroup] of byDest) {
            try {
              const destPath = await this.resolveServerMailboxPath(client, mailboxes, destKey, true);
              if (!destPath) {
                for (const m of destGroup) {
                  results.push({ ref: m.ref, ok: false, retry: false, error: `Pasta de destino "${destKey}" não existe no servidor.` });
                }
                continue;
              }
              const moveRes: any = await client.messageMove(destGroup.map((m) => m.uid).join(','), destPath, { uid: true });
              const uidMap: Map<number, number> | undefined = moveRes && moveRes.uidMap instanceof Map ? moveRes.uidMap : undefined;
              for (const m of destGroup) {
                const newUid = uidMap?.get(m.uid);
                results.push({
                  ref: m.ref,
                  ok: true,
                  newLocation: typeof newUid === 'number' ? { folderKey: destKey, uid: newUid } : undefined,
                });
              }
            } catch (err: any) {
              const retry = this.isRetryableImapError(err);
              for (const m of destGroup) {
                results.push({ ref: m.ref, ok: false, retry, error: err?.message || String(err) });
              }
            }
          }
          for (const m of group.filter((x) => x.kind === 'move' && (!x.toFolderKey || x.toFolderKey === sourceKey))) {
            results.push({ ref: m.ref, ok: true });
          }

          // 3) Excluir definitivamente
          const deletes = group.filter((x) => x.kind === 'delete');
          if (deletes.length > 0) {
            try {
              await client.messageDelete(deletes.map((d) => d.uid).join(','), { uid: true });
              for (const d of deletes) results.push({ ref: d.ref, ok: true });
            } catch (err: any) {
              const retry = this.isRetryableImapError(err);
              for (const d of deletes) results.push({ ref: d.ref, ok: false, retry, error: err?.message || String(err) });
            }
          }
        } catch (err: any) {
          const retry = this.isRetryableImapError(err);
          const done = new Set(results.map((r) => r.ref));
          for (const a of group) {
            if (!done.has(a.ref)) results.push({ ref: a.ref, ok: false, retry, error: err?.message || String(err) });
          }
        } finally {
          if (lock) lock.release();
        }
      }

      await client.logout();
      return { success: true, results };
    } catch (err: any) {
      const retry = this.isRetryableImapError(err);
      const done = new Set(results.map((r) => r.ref));
      for (const a of actions) {
        if (!done.has(a.ref)) results.push({ ref: a.ref, ok: false, retry, error: err?.message || String(err) });
      }
      try {
        await client.logout();
      } catch {}
      return { success: false, error: err?.message || String(err), results };
    }
  }

  /**
   * Provedores que já guardam sozinhos a cópia do e-mail enviado por SMTP na pasta Enviados.
   * Para eles o app NÃO grava a cópia (evita duplicidade).
   */
  public static providerAutoSavesSent(...hosts: Array<string | undefined>): boolean {
    const list = hosts.map((h) => String(h || '').toLowerCase());
    return list.some((h) =>
      /(^|\.)(gmail\.com|googlemail\.com|office365\.com|outlook\.com|hotmail\.com|live\.com)$/.test(h)
    );
  }

  /** Grava a cópia do e-mail enviado na pasta Enviados do servidor IMAP (marcada como lida). */
  public static async appendToSentFolder(
    config: MailServerConfig,
    raw: Buffer,
    date: Date
  ): Promise<{ ok: boolean; uid?: number; error?: string }> {
    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: !isTlsHostTrusted(config.host) },
      logger: false,
    });
    client.on('error', () => {});
    try {
      await client.connect();
      const mailboxes = await client.list();
      const sentPath = await this.resolveServerMailboxPath(client, mailboxes, 'sent', true);
      if (!sentPath) {
        await client.logout();
        return { ok: false, error: 'Pasta Enviados não encontrada no servidor.' };
      }
      const res: any = await client.append(sentPath, raw, ['\\Seen'], date);
      await client.logout();
      return { ok: true, uid: typeof res?.uid === 'number' ? res.uid : undefined };
    } catch (err: any) {
      try {
        await client.logout();
      } catch {}
      return { ok: false, error: err?.message || String(err) };
    }
  }

  /**
   * Creates a custom folder (or subfolder) on the IMAP server
   */
  public static async createImapFolder(
    config: MailServerConfig,
    folderName: string,
    parentFolderOrPath?: string
  ): Promise<{ success: boolean; imapPath?: string; error?: string }> {
    if (config.protocol === 'pop3' || !config.host || !config.user || (!config.pass && !config.accessToken)) {
      return { success: false, error: 'Conta IMAP não configurada.' };
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: !isTlsHostTrusted(config.host) },
      logger: false,
    });
    client.on('error', () => {});

    try {
      await client.connect();
      const mailboxes = await client.list();
      const inboxBox = mailboxes.find((m: any) => (m.path || '').toUpperCase() === 'INBOX');
      const defaultDelimiter = inboxBox?.delimiter || mailboxes[0]?.delimiter || '/';

      let parentPath = '';
      if (parentFolderOrPath) {
        const systemFolders: SupportedFolder[] = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'];
        if (systemFolders.includes(parentFolderOrPath as SupportedFolder)) {
          parentPath = this.findServerMailbox(mailboxes, parentFolderOrPath as SupportedFolder) || (parentFolderOrPath === 'inbox' ? 'INBOX' : '');
        } else {
          parentPath = parentFolderOrPath.startsWith('imap:') ? parentFolderOrPath.slice(5) : parentFolderOrPath;
        }
      }

      const fullPath = parentPath ? `${parentPath}${defaultDelimiter}${folderName}` : folderName;
      await client.mailboxCreate(fullPath);
      await client.logout();
      return { success: true, imapPath: fullPath };
    } catch (err: any) {
      try { await client.logout(); } catch {}
      return { success: false, error: err?.message || 'Erro ao criar pasta IMAP.' };
    }
  }

  /**
   * Renames a custom folder on the IMAP server
   */
  public static async renameImapFolder(
    config: MailServerConfig,
    oldImapPath: string,
    newName: string
  ): Promise<{ success: boolean; imapPath?: string; error?: string }> {
    if (config.protocol === 'pop3' || !config.host || !config.user || (!config.pass && !config.accessToken)) {
      return { success: false, error: 'Conta IMAP não configurada.' };
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: !isTlsHostTrusted(config.host) },
      logger: false,
    });
    client.on('error', () => {});

    try {
      await client.connect();
      const mailboxes = await client.list();
      const match = mailboxes.find((m: any) => m.path === oldImapPath);
      const delimiter = match?.delimiter || (oldImapPath.includes('/') ? '/' : oldImapPath.includes('.') ? '.' : '/');
      const lastDelim = oldImapPath.lastIndexOf(delimiter);
      const newPath = lastDelim >= 0 ? `${oldImapPath.slice(0, lastDelim + 1)}${newName}` : newName;
      await client.mailboxRename(oldImapPath, newPath);
      await client.logout();
      return { success: true, imapPath: newPath };
    } catch (err: any) {
      try { await client.logout(); } catch {}
      return { success: false, error: err?.message || 'Erro ao renomear pasta IMAP.' };
    }
  }

  /**
   * Deletes a custom folder on the IMAP server
   */
  public static async deleteImapFolder(
    config: MailServerConfig,
    imapPath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (config.protocol === 'pop3' || !config.host || !config.user || (!config.pass && !config.accessToken)) {
      return { success: false, error: 'Conta IMAP não configurada.' };
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: config.accessToken
        ? { user: config.user, accessToken: config.accessToken }
        : { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: !isTlsHostTrusted(config.host) },
      logger: false,
    });
    client.on('error', () => {});

    try {
      await client.connect();
      await client.mailboxDelete(imapPath);
      await client.logout();
      return { success: true };
    } catch (err: any) {
      try { await client.logout(); } catch {}
      return { success: false, error: err?.message || 'Erro ao excluir pasta IMAP.' };
    }
  }

  /**
   * Backwards-compatible fetchInbox
   */
  public static async fetchInbox(config: MailServerConfig): Promise<FetchResult> {
    return await this.fetchFolderMessages(config, 'inbox');
  }

  /**
   * Fetch real emails from POP3 server (Local Download Model)
   */
  public static async fetchPop3Inbox(config: MailServerConfig): Promise<FetchResult> {
    if (!config.host || !config.user || !config.pass) {
      return {
        success: false,
        error: 'Credenciais de e-mail POP3 não configuradas.',
      };
    }

    const pop3 = new SimplePop3Client({
      user: config.user,
      pass: config.pass,
      host: config.host,
      port: config.port || 995,
      tls: config.secure !== false,
      rejectUnauthorized: !isTlsHostTrusted(config.host),
      timeout: 15000,
    });

    try {
      await pop3.connect();
      await pop3.login();
      const stat = await pop3.stat();
      const uidlMap = await pop3.uidl();
      const knownPop3Set = new Set<string>(
        Array.isArray((config as any).knownPop3Ids) ? (config as any).knownPop3Ids : []
      );
      const batchLimit =
        typeof (config as any).pop3BatchLimit === 'number' && (config as any).pop3BatchLimit > 0
          ? (config as any).pop3BatchLimit
          : 200;

      const messages: any[] = [];
      const total = stat.count;

      // Baixa mensagens novas do servidor POP3 (mais recentes primeiro, até batchLimit por ciclo, sem duplicar via UIDL)
      for (let i = total; i >= 1; i--) {
        if (messages.length >= batchLimit) break;
        const uidlToken = uidlMap.get(i);
        const deterministicId = uidlToken
          ? `pop3-uidl-${uidlToken.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          : `pop3-seq-${i}`;
        if (knownPop3Set.has(deterministicId)) {
          continue;
        }
        try {
          const rawMessage = await pop3.retr(i);
          const parsed: any = await simpleParser(rawMessage);

          const senderName = parsed.from?.value?.[0]?.name || parsed.from?.value?.[0]?.address || 'Remetente POP3';
          const senderEmail = parsed.from?.value?.[0]?.address || '';
          const subject = parsed.subject || '(Sem Assunto)';
          const date = parsed.date ? new Date(parsed.date) : new Date();
          const pop3MessageId = deterministicId;

          let popAttachments: any[] = [];
          if (parsed.attachments && Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
            popAttachments = parsed.attachments.map((att: any, idx: number) =>
              this.saveAttachmentCache(pop3MessageId, att, idx, parsed.html)
            );
          }

          const hasRealPopAttachments = popAttachments.some((a) => !a.isSignature);

          const popReadReceiptRequestedBy = extractReadReceiptAddress(parsed.headers, senderEmail);
          const popResolvedHtml =
            parsed.html && Array.isArray(parsed.attachments)
              ? resolveCidImagesInHtml(parsed.html, parsed.attachments)
              : parsed.html;
          const popCc = formatParsedAddressField(parsed.cc);
          const popReferences = parseReferencesHeader(parsed.references);
          const popCalendarInvite = extractCalendarInviteFromParsed(parsed);
          const popListHeaders = extractListHeaders(parsed.headers);

          messages.push({
            id: pop3MessageId,
            messageIdHeader: parsed.messageId ? String(parsed.messageId).trim() : undefined,
            inReplyToHeader: parsed.inReplyTo ? String(parsed.inReplyTo).trim() : undefined,
            referencesHeader: popReferences.length > 0 ? popReferences : undefined,
            readReceiptRequestedBy: popReadReceiptRequestedBy,
            sender: senderName,
            senderEmail: senderEmail,
            avatar: '',
            recipient: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t: any) => t?.text).filter(Boolean).join(', ') : parsed.to.text) : config.user,
            cc: popCc || undefined,
            subject: subject,
            snippet: parsed.text ? parsed.text.slice(0, 100) : subject,
            body: parsed.text || `[Mensagem baixada via POP3 de ${config.host}]`,
            bodyHtml: popResolvedHtml || undefined,
            attachments: popAttachments.length > 0 ? popAttachments : undefined,
            timestamp: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            dateStr: date.toISOString(),
            sizeBytes: rawMessage ? (rawMessage as any).length : undefined,
            period: 'today',
            folder: 'inbox',
            priority: 'medium',
            isRead: false,
            isStarred: false,
            hasAttachment: hasRealPopAttachments,
            tags: ['POP3 (Local)'],
            calendarInvite: popCalendarInvite || undefined,
            listUnsubscribe: popListHeaders.listUnsubscribe,
            listUnsubscribePost: popListHeaders.listUnsubscribePost,
            listId: popListHeaders.listId,
            precedence: popListHeaders.precedence,
          });
        } catch (fetchErr) {
          console.warn(`Erro ao baixar mensagem POP3 #${i}:`, fetchErr);
        }
      }

      await pop3.quit();

      // Ordena decrescente por data (mais recente no topo)
      messages.sort((a, b) => {
        const timeA = a.dateStr ? new Date(a.dateStr).getTime() : 0;
        const timeB = b.dateStr ? new Date(b.dateStr).getTime() : 0;
        return timeB - timeA;
      });

      return {
        success: true,
        emails: messages,
        count: messages.length,
        serverTotal: total,
        hasMore: knownPop3Set.size + messages.length < total,
      };
    } catch (err: any) {
      pop3.close();
      return {
        success: false,
        error: `Erro de download POP3: ${err.message}`,
      };
    }
  }

  /**
   * Send real email via SMTP with automatic port/TLS negotiation and fallback
   */
  public static async sendSmtp(
    config: MailServerConfig & { incomingHost?: string },
    emailData: any,
    /** Conta IMAP: grava a cópia do enviado na pasta Enviados do servidor (se o provedor não fizer isso sozinho). */
    sentCopyConfig?: MailServerConfig
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    sentCopy?: { saved: boolean; uid?: number; skipped?: 'provider'; error?: string };
  }> {
    const user = (config.user || '').trim();
    const pass = config.pass || '';
    let primaryHost = (config.host || '').trim();
    const incomingHost = (config.incomingHost || '').trim();

    // Se o servidor de entrada for ex: pop.terra.com.br / imap.terra.com.br, deriva smtp.terra.com.br
    const derivedSmtpFromIncoming = incomingHost
      ? incomingHost.replace(/^(pop3?|imap4?)\./i, 'smtp.')
      : '';

    const userDomain = user.includes('@') ? user.split('@')[1].toLowerCase() : '';
    const isDefaultDomainSmtp =
      userDomain &&
      (primaryHost.toLowerCase() === `smtp.${userDomain}` ||
        primaryHost.toLowerCase() === `mail.${userDomain}` ||
        primaryHost.toLowerCase() === 'email-ssl.com.br');

    if (
      derivedSmtpFromIncoming &&
      derivedSmtpFromIncoming.toLowerCase() !== incomingHost.toLowerCase() &&
      (!primaryHost || isDefaultDomainSmtp)
    ) {
      primaryHost = derivedSmtpFromIncoming;
    }

    if (!primaryHost || !user || (!pass && !config.accessToken)) {
      return {
        success: false,
        error: 'Servidor SMTP, usuário ou senha não configurados. Verifique em Configurações do Servidor.',
      };
    }

    const configuredPort = Number(config.port) || 465;
    const altPort = configuredPort === 465 ? 587 : 465;

    const candidates: Array<{ host: string; port: number; secure: boolean }> = [
      {
        host: primaryHost,
        port: configuredPort,
        secure: configuredPort === 465,
      },
      {
        host: primaryHost,
        port: altPort,
        secure: altPort === 465,
      },
    ];

    if (derivedSmtpFromIncoming && derivedSmtpFromIncoming !== primaryHost) {
      candidates.push(
        { host: derivedSmtpFromIncoming, port: 587, secure: false },
        { host: derivedSmtpFromIncoming, port: 465, secure: true }
      );
    }

    let lastError = '';
    const ehloHostname =
      userDomain && userDomain !== 'terra.com.br'
        ? userDomain
        : 'client.anecttamail.local';

    for (const candidate of candidates) {
      try {
        const transporter = nodemailer.createTransport({
          name: ehloHostname,
          host: candidate.host,
          port: candidate.port,
          secure: candidate.secure,
          auth: config.accessToken
            ? ({
                type: 'OAuth2',
                user,
                accessToken: config.accessToken,
              } as any)
            : {
                user,
                pass,
              },
          tls: {
            rejectUnauthorized: !isTlsHostTrusted(candidate.host),
          },
          connectionTimeout: 12000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });

        const parseTokenList = (raw?: unknown): string[] =>
          String(raw || '')
            .split(/[;,]/)
            .map((r) => r.trim())
            .filter(Boolean);

        const toTokens = parseTokenList(emailData.recipient);
        const ccTokens = parseTokenList(emailData.cc);
        const bccTokens = parseTokenList(emailData.bcc);

        const validateTokens = (tokens: string[], label: string): string | null => {
          const invalid = tokens.find((token) => !extractValidEmail(token));
          return invalid
            ? `Destinatário inválido em ${label}: "${invalid}". Verifique o endereço de e-mail.`
            : null;
        };

        const validationError =
          validateTokens(toTokens, 'Para') ||
          validateTokens(ccTokens, 'Cc') ||
          validateTokens(bccTokens, 'CCO');

        if (validationError) {
          return { success: false, error: validationError };
        }

        if (toTokens.length + ccTokens.length + bccTokens.length === 0) {
          return {
            success: false,
            error: 'Nenhum destinatário válido informado.',
          };
        }

        const safeSenderName = String(emailData.sender || user)
          .replace(/["<>\r\n]/g, '')
          .trim() || user;

        const mailOptions: any = {
          from: `"${safeSenderName}" <${user}>`,
          subject: emailData.subject,
          text: emailData.body,
        };

        if (toTokens.length > 0) mailOptions.to = toTokens.join(', ');
        if (ccTokens.length > 0) mailOptions.cc = ccTokens.join(', ');
        if (bccTokens.length > 0) mailOptions.bcc = bccTokens.join(', ');
        if (emailData.inReplyTo && String(emailData.inReplyTo).trim()) {
          mailOptions.inReplyTo = String(emailData.inReplyTo).trim();
        }
        if (Array.isArray(emailData.references) && emailData.references.length > 0) {
          mailOptions.references = emailData.references
            .map((r: any) => String(r || '').trim())
            .filter(Boolean);
        } else if (typeof emailData.references === 'string' && emailData.references.trim()) {
          mailOptions.references = emailData.references.trim();
        }

        let inlineCidAttachments: any[] = [];
        if (emailData.html) {
          const cidResult = extractDataUrlImagesToCid(String(emailData.html));
          mailOptions.html = cidResult.html;
          inlineCidAttachments = cidResult.inlineAttachments;
        }

        if (emailData.icalEvent && emailData.icalEvent.content) {
          mailOptions.icalEvent = {
            method: emailData.icalEvent.method || 'REPLY',
            filename: emailData.icalEvent.filename || 'invite.ics',
            content: String(emailData.icalEvent.content),
          };
        }

        if (emailData.requestReadReceipt || emailData.trackingEnabled) {
          const receiptAddress = `"${safeSenderName}" <${user}>`;
          mailOptions.headers = {
            ...(mailOptions.headers || {}),
            'Disposition-Notification-To': receiptAddress,
            'Return-Receipt-To': receiptAddress,
            'X-Confirm-Reading-To': receiptAddress,
          };
        }

        const validatedAttachments: any[] = [...inlineCidAttachments];
        if (emailData.attachments && Array.isArray(emailData.attachments) && emailData.attachments.length > 0) {
          for (const att of emailData.attachments) {
            if (att.path) {
              if (!fs.existsSync(att.path)) {
                return {
                  success: false,
                  error: `O anexo "${att.name || att.path}" não foi encontrado no disco. Verifique se o arquivo foi movido ou excluído.`,
                };
              }
              validatedAttachments.push({
                filename: att.name || path.basename(att.path || 'anexo'),
                path: att.path,
                cid: att.cid || undefined,
              });
            }
          }
        }
        if (validatedAttachments.length > 0) {
          mailOptions.attachments = validatedAttachments;
        }

        // Message-ID e data definidos aqui para a cópia em Enviados ser idêntica à mensagem enviada
        mailOptions.messageId = `<${crypto.randomUUID()}@${userDomain || 'anecttamail.local'}>`;
        mailOptions.date = new Date();

        const info = await transporter.sendMail(mailOptions);

        let sentCopy: { saved: boolean; uid?: number; skipped?: 'provider'; error?: string } | undefined;
        if (sentCopyConfig && sentCopyConfig.protocol !== 'pop3' && sentCopyConfig.host) {
          if (this.providerAutoSavesSent(candidate.host, sentCopyConfig.host)) {
            sentCopy = { saved: false, skipped: 'provider' };
          } else {
            try {
              const node: any = new MailComposer(mailOptions).compile();
              node.keepBcc = true; // a cópia em Enviados mantém o Cco, como nos demais clientes
              const raw: Buffer = await node.build();
              const appendRes = await this.appendToSentFolder(sentCopyConfig, raw, mailOptions.date);
              sentCopy = appendRes.ok
                ? { saved: true, uid: appendRes.uid }
                : { saved: false, error: appendRes.error };
              if (!appendRes.ok) console.warn('[IMAP] Não foi possível gravar a cópia em Enviados:', appendRes.error);
            } catch (copyErr: any) {
              sentCopy = { saved: false, error: copyErr?.message || String(copyErr) };
              console.warn('[IMAP] Falha ao montar/gravar a cópia em Enviados:', copyErr?.message || copyErr);
            }
          }
        }

        return {
          success: true,
          messageId: info.messageId || mailOptions.messageId,
          sentCopy,
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn(
          `[SMTP] Tentativa falhou em ${candidate.host}:${candidate.port} (secure=${candidate.secure}):`,
          lastError
        );
        // Se for erro explícito de autenticação (535) no host correto, não precisa tentar outras portas do mesmo host se já tentou
      }
    }

    return {
      success: false,
      error: `Falha SMTP (${primaryHost}): ${lastError}`,
    };
  }
}
