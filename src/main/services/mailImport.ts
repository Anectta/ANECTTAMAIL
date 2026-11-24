import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { simpleParser } from 'mailparser';
import { PSTFile, PSTFolder, PSTMessage } from 'pst-extractor';
import { MailService, resolveCidImagesInHtml } from './mailService';
import { MailStore } from './mailStore';
import { stripEmailBody } from '../../renderer/utils/emailBodyStrip';

/**
 * Importação de e-mails de outros programas (.pst do Outlook, .mbox do Thunderbird e outros,
 * arquivos .eml) DIRETO para uma conta do app.
 *
 *  - Os e-mails entram no formato do app (data, conteúdo, anexos, Message-ID).
 *  - As pastas do arquivo viram pastas da conta (as de sistema — Entrada, Enviados... — vão para
 *    as pastas equivalentes do app).
 *  - Mensagens repetidas (mesmo Message-ID) não entram duas vezes.
 *  - Com o banco local, o conteúdo é gravado direto no banco em lotes (arquivos grandes não
 *    sobrecarregam a memória); o app recebe só os resumos.
 *  - Lê em etapas, devolvendo a vez ao app entre elas (a tela não trava).
 */

export type ImportMode = 'pst' | 'mbox' | 'eml' | 'folder';

export interface ImportedFolder {
  /** Id da pasta no app (estável para o mesmo caminho e conta). */
  id: string;
  name: string;
  path: string;
  /** Pasta de sistema mãe (ex.: subpasta da Caixa de Entrada). */
  parentSystem?: string;
  /** Pasta importada mãe (id). */
  parentId?: string;
}

export interface ImportProgress {
  processed: number;
  imported: number;
  duplicates: number;
  folder?: string;
  file?: string;
}

export interface ImportResult {
  success: boolean;
  canceled?: boolean;
  count: number;
  duplicates: number;
  failed: number;
  filesScanned: number;
  folders: ImportedFolder[];
  /** Resumos (com banco local) ou e-mails completos (sem banco). */
  emails: any[];
  storedInDb: boolean;
  error?: string;
}

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const DB_BATCH = 200;
const YIELD_EVERY = 25;

const yieldToApp = () => new Promise<void>((r) => setImmediate(r));

export const normalizeMessageId = (id?: string | null): string =>
  String(id || '')
    .trim()
    .replace(/^<+|>+$/g, '')
    .toLowerCase();

/** Pastas de sistema reconhecidas pelo nome (Outlook/Thunderbird, português e inglês). */
const SYSTEM_FOLDER_NAMES: Array<{ id: string; names: string[] }> = [
  { id: 'inbox', names: ['inbox', 'caixa de entrada', 'entrada'] },
  { id: 'sent', names: ['sent', 'sent items', 'sent mail', 'sent messages', 'itens enviados', 'enviados', 'enviadas', 'mensagens enviadas'] },
  { id: 'drafts', names: ['drafts', 'draft', 'rascunhos', 'rascunho'] },
  { id: 'trash', names: ['trash', 'deleted items', 'deleted messages', 'lixeira', 'itens excluídos', 'itens excluidos', 'excluídos', 'excluidos'] },
  { id: 'junk', names: ['junk', 'junk e-mail', 'junk email', 'spam', 'bulk', 'lixo eletrônico', 'lixo eletronico'] },
  { id: 'archive', names: ['archive', 'archives', 'arquivo morto', 'arquivo'] },
];

/** Nomes de raiz de arquivos .pst (não viram pasta). */
const PST_ROOT_NAMES = [
  'top of personal folders',
  'início do arquivo de dados do outlook',
  'inicio do arquivo de dados do outlook',
  'top of outlook data file',
  'root - mailbox',
  'ipm_subtree',
];

export function systemFolderOf(name: string): string | null {
  const n = (name || '').trim().toLowerCase();
  for (const s of SYSTEM_FOLDER_NAMES) if (s.names.includes(n)) return s.id;
  return null;
}

const folderIdFor = (accountId: string, folderPath: string) =>
  `imp-${accountId}-${crypto.createHash('sha1').update(folderPath.toLowerCase()).digest('hex').slice(0, 10)}`;

/**
 * Resolve a pasta de destino no app para um caminho de pastas do arquivo.
 * Registra as pastas importadas necessárias (com a hierarquia) em `folders`.
 */
export function resolveTargetFolder(
  segments: string[],
  accountId: string,
  folders: Map<string, ImportedFolder>
): string {
  let clean = segments.map((s) => s.trim()).filter(Boolean);
  // Níveis "contêiner" antes de uma pasta de sistema (ex.: "Conta/Pasta pessoal/Itens Enviados")
  const sysAt = clean.findIndex((s) => systemFolderOf(s));
  if (sysAt > 0) clean = clean.slice(sysAt);
  if (clean.length === 0) return 'inbox';
  const firstSystem = systemFolderOf(clean[0]);
  if (clean.length === 1 && firstSystem) return firstSystem;

  // Pastas próprias: cria a cadeia (sob a pasta de sistema, se a primeira for de sistema)
  const start = firstSystem ? 1 : 0;
  let parentId: string | undefined;
  let parentSystem: string | undefined = firstSystem || undefined;
  let lastId = firstSystem || 'inbox';
  for (let i = start; i < clean.length; i++) {
    const folderPath = clean.slice(0, i + 1).join('/');
    const id = folderIdFor(accountId, folderPath);
    if (!folders.has(id)) {
      folders.set(id, {
        id,
        name: clean[i],
        path: folderPath,
        parentSystem: parentId ? undefined : parentSystem,
        parentId,
      });
    }
    parentId = id;
    parentSystem = undefined;
    lastId = id;
  }
  return lastId;
}

const periodOf = (ms: number): 'today' | 'yesterday' | 'last_week' | 'older' => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;
  if (ms >= todayStart) return 'today';
  if (ms >= todayStart - DAY) return 'yesterday';
  if (ms >= todayStart - 7 * DAY) return 'last_week';
  return 'older';
};

interface RawEmail {
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  sender: string;
  senderEmail: string;
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string;
  date: Date;
  isRead: boolean;
  isStarred?: boolean;
  importance?: 'high' | 'medium' | 'low';
  folder: string;
  attachments: Array<{ filename: string; content?: Buffer; contentType?: string; size?: number; cid?: string }>;
}

class ImportSession {
  private seen: Set<string>;
  private pending: any[] = [];
  private lastProgressAt = 0;
  readonly folders = new Map<string, ImportedFolder>();
  readonly out: any[] = [];
  count = 0;
  duplicates = 0;
  failed = 0;
  processed = 0;
  private idx = 0;
  private readonly store = MailStore.get().isAvailable() ? MailStore.get() : null;
  private readonly stamp = Date.now().toString(36);

  constructor(
    private readonly accountId: string,
    private readonly accountEmail: string,
    private readonly mode: ImportMode,
    knownMessageIds: string[],
    private readonly onProgress?: (p: ImportProgress) => void
  ) {
    this.seen = new Set(knownMessageIds.map(normalizeMessageId).filter(Boolean));
  }

  get storedInDb() {
    return Boolean(this.store);
  }

  progress(extra: Partial<ImportProgress> = {}, force = false) {
    const now = Date.now();
    if (!force && now - this.lastProgressAt < 300) return;
    this.lastProgressAt = now;
    this.onProgress?.({ processed: this.processed, imported: this.count, duplicates: this.duplicates, ...extra });
  }

  /** Converte para o formato do app, salva anexos e grava (ou guarda) o e-mail. */
  add(raw: RawEmail) {
    this.processed++;
    const msgId = normalizeMessageId(raw.messageId);
    if (msgId) {
      if (this.seen.has(msgId)) {
        this.duplicates++;
        return;
      }
      this.seen.add(msgId);
    }
    const id = `${this.accountId}-imported-${this.stamp}-${this.idx++}`;
    const ms = isNaN(raw.date.getTime()) ? Date.now() : raw.date.getTime();
    const date = new Date(ms);

    const attachments = raw.attachments.map((att, i) =>
      MailService.saveAttachmentCache(
        id,
        { filename: att.filename, content: att.content, contentType: att.contentType, size: att.size, cid: att.cid, contentId: att.cid },
        i,
        raw.html
      )
    );
    const html = raw.html
      ? resolveCidImagesInHtml(raw.html, raw.attachments.map((a) => ({ ...a, cid: a.cid, contentId: a.cid })))
      : undefined;
    const text = raw.text || (raw.html ? raw.html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ') : '');
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 140);

    const email: any = {
      id,
      accountId: this.accountId,
      messageIdHeader: raw.messageId ? String(raw.messageId).trim() : undefined,
      inReplyToHeader: raw.inReplyTo || undefined,
      referencesHeader: raw.references && raw.references.length > 0 ? raw.references : undefined,
      sender: raw.sender || raw.senderEmail || 'Remetente desconhecido',
      senderEmail: raw.senderEmail || '',
      avatar: '',
      recipient: raw.to || '',
      cc: raw.cc || undefined,
      subject: raw.subject || '(Sem assunto)',
      snippet: snippet || raw.subject || '',
      body: text.trim(),
      bodyHtml: html,
      attachments: attachments.length > 0 ? attachments : undefined,
      hasAttachment: attachments.some((a) => !a.isSignature),
      timestamp: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dateStr: date.toISOString(),
      period: periodOf(ms),
      folder: raw.folder,
      priority: raw.importance || 'medium',
      isRead: raw.isRead,
      isStarred: Boolean(raw.isStarred),
      tags: ['Importado'],
      importedFrom: this.mode,
    };
    this.count++;
    this.pending.push(email);
    if (this.pending.length >= DB_BATCH) this.flush();
  }

  /** Grava o lote pendente no banco (ou guarda para devolver ao app). */
  flush() {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    if (this.store) {
      const records = batch.map((e) => {
        const s = stripEmailBody(e);
        return { meta: s.meta, body: s.body, bodyHtml: s.bodyHtml, hasBody: s.hasBody, accountEmail: this.accountEmail };
      });
      this.store.upsert(records);
      for (const r of records) this.out.push(r.meta);
    } else {
      this.out.push(...batch);
    }
  }
}

// ---------------- Leitores ----------------

async function importPst(filePath: string, session: ImportSession, accountId: string) {
  const pst = new PSTFile(filePath);
  try {
    const walk = async (folder: PSTFolder, segments: string[]) => {
      const name = folder.displayName || '';
      const isRoot = segments.length === 0 && (PST_ROOT_NAMES.includes(name.trim().toLowerCase()) || !name.trim());
      const here = isRoot ? segments : [...segments, name];
      try {
        if (folder.contentCount > 0) {
          let child = folder.getNextChild();
          let n = 0;
          while (child != null) {
            try {
              if (child instanceof PSTMessage && !child.isAssociated) {
                const msgClass = (child.messageClass || '').toUpperCase();
                if (!msgClass || msgClass.startsWith('IPM.NOTE') || msgClass.startsWith('IPM.POST')) {
                  const attachments: RawEmail['attachments'] = [];
                  for (let i = 0; i < (child.numberOfAttachments || 0); i++) {
                    try {
                      const att = child.getAttachment(i);
                      const filename = att.longFilename || att.filename || `anexo-${i + 1}`;
                      let content: Buffer | undefined;
                      const size = att.filesize || 0;
                      const stream = att.fileInputStream;
                      if (stream && size > 0 && size <= MAX_ATTACHMENT_BYTES) {
                        content = Buffer.alloc(size);
                        stream.readCompletely(content);
                      }
                      attachments.push({ filename, content, contentType: att.mimeTag || undefined, size, cid: att.contentId || undefined });
                    } catch {
                      // anexo ilegível: segue
                    }
                  }
                  const date = child.messageDeliveryTime || child.clientSubmitTime || new Date();
                  session.add({
                    messageId: child.internetMessageId || undefined,
                    sender: child.senderName || child.sentRepresentingName || '',
                    senderEmail: child.senderEmailAddress || child.sentRepresentingEmailAddress || '',
                    to: child.displayTo || '',
                    cc: child.displayCC || undefined,
                    subject: child.subject || '',
                    text: child.body || '',
                    html: child.bodyHTML || undefined,
                    date,
                    isRead: Boolean(child.isRead),
                    importance: child.importance === 2 ? 'high' : child.importance === 0 ? 'low' : 'medium',
                    folder: resolveTargetFolder(here, accountId, session.folders),
                    attachments,
                  });
                }
              }
            } catch {
              session.failed++;
            }
            if (++n % YIELD_EVERY === 0) {
              session.progress({ folder: here.join('/') });
              await yieldToApp();
            }
            child = folder.getNextChild();
          }
        }
      } catch {
        // pasta ilegível
      }
      if (folder.hasSubfolders) {
        let subs: PSTFolder[] = [];
        try {
          subs = folder.getSubFolders();
        } catch {}
        for (const sub of subs) await walk(sub, here);
      }
    };
    await walk(pst.getRootFolder(), []);
  } finally {
    pst.close();
  }
}

function parsedToRaw(parsed: any, folder: string): RawEmail {
  const from = parsed.from?.value?.[0];
  const list = (field: any) =>
    (Array.isArray(field) ? field : field ? [field] : [])
      .flatMap((f: any) => f?.value || [])
      .map((v: any) => (v?.name ? `${v.name} <${v.address}>` : v?.address))
      .filter(Boolean)
      .join(', ');
  const refs = Array.isArray(parsed.references)
    ? parsed.references
    : typeof parsed.references === 'string'
    ? parsed.references.split(/\s+/)
    : [];
  const flags = String(parsed.headers?.get?.('x-mozilla-status') || '');
  const status = String(parsed.headers?.get?.('status') || '');
  // Thunderbird: X-Mozilla-Status bit 0x0001 = lido; mbox padrão: "Status: RO" = lido
  const isRead = flags ? (parseInt(flags, 16) & 0x0001) === 1 : /R/.test(status);
  return {
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo ? String(parsed.inReplyTo).trim() : undefined,
    references: refs.map((r: string) => String(r).trim()).filter(Boolean),
    sender: from?.name || from?.address || '',
    senderEmail: from?.address || '',
    to: list(parsed.to),
    cc: list(parsed.cc) || undefined,
    subject: parsed.subject || '',
    text: parsed.text || '',
    html: typeof parsed.html === 'string' ? parsed.html : undefined,
    date: parsed.date ? new Date(parsed.date) : new Date(),
    isRead,
    folder,
    attachments: (parsed.attachments || []).map((a: any) => ({
      filename: a.filename || 'anexo',
      content: a.content,
      contentType: a.contentType,
      size: a.size,
      cid: a.cid || a.contentId,
    })),
  };
}

async function importMbox(filePath: string, session: ImportSession, folder: string, label: string) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lines: string[] = [];
  let n = 0;
  const flushMessage = async () => {
    const raw = lines.join('\n').trim();
    lines = [];
    if (!raw) return;
    try {
      session.add(parsedToRaw(await simpleParser(raw), folder));
    } catch {
      session.failed++;
    }
    if (++n % YIELD_EVERY === 0) {
      session.progress({ folder: label });
      await yieldToApp();
    }
  };
  for await (const line of rl) {
    // Separador de mensagens do formato mbox
    if (line.startsWith('From ') && lines.length > 0) await flushMessage();
    else if (line.startsWith('From ') && lines.length === 0) continue;
    else lines.push(line.startsWith('>From ') ? line.slice(1) : line);
  }
  await flushMessage();
}

async function importEml(filePath: string, session: ImportSession, folder: string) {
  try {
    const raw = await fs.promises.readFile(filePath);
    session.add(parsedToRaw(await simpleParser(raw), folder));
  } catch {
    session.failed++;
  }
}

/** Pasta de perfil (ex.: Thunderbird): coleta .mbox/arquivos mbox sem extensão/.eml/.pst com o caminho das pastas. */
export async function collectProfileFiles(dir: string): Promise<Array<{ filePath: string; segments: string[] }>> {
  const out: Array<{ filePath: string; segments: string[] }> = [];
  const walk = async (current: string, segments: string[], depth: number) => {
    if (depth > 6) return;
    const entries = await fs.promises.readdir(current, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        await walk(full, [...segments, e.name.replace(/\.(sbd|mbox)$/i, '')], depth + 1);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (ext === '.msf' || e.name.startsWith('.')) continue;
        if (ext === '.eml' || ext === '.mbox' || ext === '.pst') {
          out.push({ filePath: full, segments: ext === '.eml' ? segments : [...segments, path.basename(e.name, ext)] });
        } else if (!ext) {
          try {
            const fh = await fs.promises.open(full, 'r');
            const buf = Buffer.alloc(16);
            const { bytesRead } = await fh.read(buf, 0, 16, 0);
            await fh.close();
            if (bytesRead > 5 && buf.toString('utf8', 0, bytesRead).startsWith('From ')) {
              out.push({ filePath: full, segments: [...segments, e.name] });
            }
          } catch {}
        }
      }
    }
  };
  await walk(dir, [], 0);
  // Remove níveis que não são pastas de e-mail (ex.: "Mail/Local Folders", "ImapMail/imap.servidor.com")
  return out.map((f) => {
    const segs = f.segments.filter(
      (s, i) => i === f.segments.length - 1 || !/^(mail|imapmail|local folders|pastas locais)$/i.test(s) && !/\.[a-z]{2,}/i.test(s)
    );
    const firstSystem = segs.findIndex((s) => systemFolderOf(s));
    return { filePath: f.filePath, segments: firstSystem > 0 ? segs.slice(firstSystem) : segs };
  });
}

async function isBinaryPst(filePath: string): Promise<boolean> {
  try {
    const fh = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    await fh.close();
    return bytesRead === 4 && buf.toString('ascii') === '!BDN';
  } catch {
    return false;
  }
}

export async function importIntoAccount(options: {
  accountId: string;
  accountEmail: string;
  mode: ImportMode;
  paths: string[];
  knownMessageIds?: string[];
  onProgress?: (p: ImportProgress) => void;
}): Promise<ImportResult> {
  const { accountId, accountEmail, mode, paths } = options;
  const session = new ImportSession(accountId, accountEmail, mode, options.knownMessageIds || [], options.onProgress);
  let files: Array<{ filePath: string; segments: string[] }> = [];
  if (mode === 'folder') {
    for (const dir of paths) files.push(...(await collectProfileFiles(dir)));
  } else {
    files = paths.map((p) => ({
      filePath: p,
      // .mbox/.eml soltos: o nome do arquivo indica a pasta (ex.: "Sent.mbox" → Enviados)
      segments: mode === 'eml' ? ['inbox'] : [path.basename(p, path.extname(p))],
    }));
  }

  try {
    for (const f of files) {
      const ext = path.extname(f.filePath).toLowerCase();
      session.progress({ file: path.basename(f.filePath) }, true);
      if (ext === '.pst') {
        if (await isBinaryPst(f.filePath)) await importPst(f.filePath, session, accountId);
        else session.failed++;
      } else if (ext === '.eml') {
        await importEml(f.filePath, session, resolveTargetFolder(f.segments, accountId, session.folders));
      } else {
        const folder = resolveTargetFolder(f.segments, accountId, session.folders);
        await importMbox(f.filePath, session, folder, f.segments.join('/'));
      }
      session.flush();
    }
    session.flush();
    session.progress({}, true);

    // Só as pastas que receberam e-mails (e as mães delas)
    const used = new Set(session.out.map((e) => e.folder));
    const keep = new Set<string>();
    for (const id of used) {
      let cur = session.folders.get(id);
      while (cur && !keep.has(cur.id)) {
        keep.add(cur.id);
        cur = cur.parentId ? session.folders.get(cur.parentId) : undefined;
      }
    }
    return {
      success: true,
      count: session.count,
      duplicates: session.duplicates,
      failed: session.failed,
      filesScanned: files.length,
      folders: Array.from(session.folders.values()).filter((f) => keep.has(f.id)),
      emails: session.out,
      storedInDb: session.storedInDb,
    };
  } catch (err: any) {
    session.flush();
    return {
      success: session.count > 0,
      count: session.count,
      duplicates: session.duplicates,
      failed: session.failed,
      filesScanned: files.length,
      folders: Array.from(session.folders.values()),
      emails: session.out,
      storedInDb: session.storedInDb,
      error: err?.message || 'Falha na importação',
    };
  }
}
