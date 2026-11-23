import fs from 'fs';
import path from 'path';
// SQLite embutido no Node do Electron (sem componentes nativos extras)
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { stripEmailBody } from '../../renderer/utils/emailBodyStrip';

/**
 * Banco local de e-mails (SQLite).
 *
 *  - emails:        uma linha por e-mail com o "resumo" (remetente, assunto, data, pasta, flags...)
 *                   em JSON. É só isso que o app carrega ao abrir.
 *  - email_bodies:  o conteúdo (texto + HTML), criptografado, lido só quando o e-mail é aberto.
 *  - email_fts:     índice de pesquisa (FTS5) sem cópia do texto (content=''), com acentos ignorados.
 *
 * Cada mudança grava só os e-mails afetados — nada de regravar tudo.
 * Na primeira execução, converte o cache antigo (mail-cache.bin) e o guarda como cópia de segurança.
 */

export interface BodyCrypto {
  available: () => boolean;
  encrypt: (text: string) => Buffer;
  decrypt: (data: Buffer) => string;
}

export interface StoreUpsertRecord {
  meta: Record<string, any>;
  body?: string;
  bodyHtml?: string;
  hasBody?: boolean;
  /** Endereço da conta (usado para filtrar a pesquisa por conta). */
  accountEmail?: string;
}

export interface StoreStatus {
  available: boolean;
  count: number;
  migratedNow?: boolean;
  migrationMs?: number;
  error?: string;
}

const DB_FILE = 'mail-store.db';
const FTS_BODY_MAX = 50_000;

const htmlToText = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

const toMs = (meta: Record<string, any>): number => {
  for (const key of ['receivedDateStr', 'dateStr']) {
    const v = meta[key];
    if (typeof v === 'string') {
      const t = new Date(v).getTime();
      if (!isNaN(t)) return t;
    }
  }
  return 0;
};

export class MailStore {
  private static instance: MailStore | null = null;
  static get(): MailStore {
    if (!MailStore.instance) MailStore.instance = new MailStore();
    return MailStore.instance;
  }

  private db: DatabaseSync | null = null;
  private crypto: BodyCrypto | null = null;
  private dir = '';
  private status: StoreStatus = { available: false, count: 0 };
  private log: (msg: string) => void = () => {};

  private st!: {
    findRid: StatementSync;
    insertEmail: StatementSync;
    updateEmail: StatementSync;
    upsertBody: StatementSync;
    ftsDelete: StatementSync;
    ftsInsert: StatementSync;
    deleteEmail: StatementSync;
    deleteBody: StatementSync;
  };

  getStatus(): StoreStatus {
    return this.status;
  }

  isAvailable(): boolean {
    return this.status.available && this.db !== null;
  }

  getDbPath(dir = this.dir): string {
    return path.join(dir, DB_FILE);
  }

  /**
   * Abre (ou cria) o banco e, se for a primeira vez, converte o cache antigo.
   * Qualquer falha deixa o banco indisponível e o app continua usando o cache antigo.
   */
  init(dataDir: string, crypto: BodyCrypto, legacyCachePath: string, log?: (msg: string) => void): StoreStatus {
    this.dir = dataDir;
    this.crypto = crypto;
    if (log) this.log = log;
    this.status = { available: false, count: 0 };
    let db: DatabaseSync | null = null;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      db = new DatabaseSync(this.getDbPath());
      // Modo de diário padrão (DELETE): funciona também em pastas de rede
      db.exec('PRAGMA synchronous = NORMAL;');
      db.exec('PRAGMA temp_store = MEMORY;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS emails (
          rid INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          account_id TEXT,
          account_email TEXT,
          folder TEXT,
          date_ms INTEGER,
          meta TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date_ms DESC);
        CREATE TABLE IF NOT EXISTS email_bodies (
          id TEXT PRIMARY KEY,
          enc INTEGER NOT NULL,
          data BLOB NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS email_fts USING fts5(
          subject, sender, recipient, body, attachments,
          content='', contentless_delete=1,
          tokenize='unicode61 remove_diacritics 2'
        );
      `);
      this.db = db;
      this.prepare();

      // Converte na primeira vez — e também se um cache antigo reapareceu (sessão em que o banco
      // falhou e o app gravou no formato antigo): assim nada feito naquela sessão se perde.
      const migrated = this.kvGet('legacy_migrated') === '1';
      if (!migrated || fs.existsSync(legacyCachePath)) {
        const t0 = Date.now();
        const n = this.migrateLegacyCache(legacyCachePath);
        this.kvSet('legacy_migrated', '1');
        this.status.migratedNow = n > 0;
        this.status.migrationMs = Date.now() - t0;
        this.log(`[store] conversão do cache antigo: ${n} e-mails em ${this.status.migrationMs} ms`);
      }

      this.status.available = true;
      this.status.count = Number((db.prepare('SELECT count(*) AS c FROM emails').get() as any)?.c || 0);
      this.log(`[store] banco aberto: ${this.status.count} e-mails (${this.getDbPath()})`);
    } catch (err: any) {
      this.status = { available: false, count: 0, error: err?.message || String(err) };
      this.log(`[store] ERRO ao abrir o banco — usando o cache antigo: ${this.status.error}`);
      // Fecha a conexão (senão o arquivo fica preso)
      try {
        (this.db ?? db)?.close();
      } catch {}
      this.db = null;
    }
    return this.status;
  }

  private prepare(): void {
    const db = this.db!;
    this.st = {
      findRid: db.prepare('SELECT rid FROM emails WHERE id = ?'),
      insertEmail: db.prepare(
        'INSERT INTO emails (id, account_id, account_email, folder, date_ms, meta) VALUES (?, ?, ?, ?, ?, ?)'
      ),
      updateEmail: db.prepare(
        'UPDATE emails SET account_id = ?, account_email = COALESCE(?, account_email), folder = ?, date_ms = ?, meta = ? WHERE rid = ?'
      ),
      upsertBody: db.prepare('INSERT OR REPLACE INTO email_bodies (id, enc, data) VALUES (?, ?, ?)'),
      ftsDelete: db.prepare('DELETE FROM email_fts WHERE rowid = ?'),
      ftsInsert: db.prepare(
        'INSERT INTO email_fts (rowid, subject, sender, recipient, body, attachments) VALUES (?, ?, ?, ?, ?, ?)'
      ),
      deleteEmail: db.prepare('DELETE FROM emails WHERE rid = ?'),
      deleteBody: db.prepare('DELETE FROM email_bodies WHERE id = ?'),
    };
  }

  private kvGet(key: string): string | undefined {
    const row = this.db!.prepare('SELECT value FROM kv WHERE key = ?').get(key) as any;
    return row ? String(row.value) : undefined;
  }

  private kvSet(key: string, value: string): void {
    this.db!.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
  }

  private transaction<T>(fn: () => T): T {
    const db = this.db!;
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  private encodeBody(body?: string, bodyHtml?: string): { enc: number; data: Buffer } {
    const json = JSON.stringify({ body, bodyHtml });
    if (this.crypto && this.crypto.available()) {
      return { enc: 1, data: this.crypto.encrypt(json) };
    }
    return { enc: 0, data: Buffer.from(json, 'utf-8') };
  }

  private decodeBody(enc: number, data: Uint8Array): { body?: string; bodyHtml?: string } {
    const buf = Buffer.from(data);
    const json = enc === 1 && this.crypto ? this.crypto.decrypt(buf) : buf.toString('utf-8');
    const parsed = JSON.parse(json);
    return { body: parsed?.body ?? undefined, bodyHtml: parsed?.bodyHtml ?? undefined };
  }

  /** Grava um e-mail (resumo; e conteúdo + índice de pesquisa quando vier o conteúdo). */
  private upsertOne(rec: StoreUpsertRecord): void {
    const meta = rec.meta;
    const id = typeof meta?.id === 'string' ? meta.id : '';
    if (!id) return;
    const metaJson = JSON.stringify(meta);
    const dateMs = toMs(meta);
    const folder = typeof meta.folder === 'string' ? meta.folder : null;
    const accountId = typeof meta.accountId === 'string' ? meta.accountId : null;
    const accountEmail = rec.accountEmail ? rec.accountEmail.toLowerCase() : null;

    const existing = this.st.findRid.get(id) as any;
    let rid: number;
    let isNew = false;
    if (existing) {
      rid = Number(existing.rid);
      this.st.updateEmail.run(accountId, accountEmail, folder, dateMs, metaJson, rid);
    } else {
      const res = this.st.insertEmail.run(id, accountId, accountEmail, folder, dateMs, metaJson);
      rid = Number(res.lastInsertRowid);
      isNew = true;
    }

    if (rec.hasBody) {
      const { enc, data } = this.encodeBody(rec.body, rec.bodyHtml);
      this.st.upsertBody.run(id, enc, data);
    }

    // Índice de pesquisa: refeito quando chega conteúdo novo (ou e-mail novo sem conteúdo)
    if (rec.hasBody || isNew) {
      if (!isNew) this.st.ftsDelete.run(rid);
      const text = rec.body && rec.body.trim() ? rec.body : rec.bodyHtml ? htmlToText(rec.bodyHtml) : String(meta.snippet || '');
      const attNames = Array.isArray(meta.attachments)
        ? meta.attachments.map((a: any) => a?.name || '').filter(Boolean).join(' ')
        : '';
      this.st.ftsInsert.run(
        rid,
        String(meta.subject || ''),
        `${meta.sender || ''} ${meta.senderEmail || ''}`,
        `${meta.recipient || ''} ${meta.cc || ''}`,
        text.slice(0, FTS_BODY_MAX),
        attNames
      );
    }
  }

  upsert(records: StoreUpsertRecord[]): number {
    if (!this.isAvailable() || !Array.isArray(records) || records.length === 0) return 0;
    let n = 0;
    this.transaction(() => {
      for (const rec of records) {
        try {
          this.upsertOne(rec);
          n++;
        } catch (err: any) {
          this.log(`[store] falha ao gravar ${rec?.meta?.id}: ${err?.message}`);
        }
      }
    });
    return n;
  }

  remove(ids: string[]): number {
    if (!this.isAvailable() || !Array.isArray(ids) || ids.length === 0) return 0;
    let n = 0;
    this.transaction(() => {
      for (const id of ids) {
        const row = this.st.findRid.get(id) as any;
        if (!row) continue;
        const rid = Number(row.rid);
        try {
          this.st.ftsDelete.run(rid);
        } catch {}
        this.st.deleteEmail.run(rid);
        this.st.deleteBody.run(id);
        n++;
      }
    });
    return n;
  }

  /** Todos os resumos (sem conteúdo), já como texto JSON de um array — rápido de enviar ao app. */
  loadAllMetaJson(): string {
    if (!this.isAvailable()) return '[]';
    const rows = this.db!.prepare('SELECT meta FROM emails ORDER BY date_ms DESC').all() as any[];
    return `[${rows.map((r) => r.meta).join(',')}]`;
  }

  getBodies(ids: string[]): Record<string, { body?: string; bodyHtml?: string }> {
    const out: Record<string, { body?: string; bodyHtml?: string }> = {};
    if (!this.isAvailable() || !Array.isArray(ids) || ids.length === 0) return out;
    const stmt = this.db!.prepare('SELECT enc, data FROM email_bodies WHERE id = ?');
    for (const id of ids) {
      const row = stmt.get(id) as any;
      if (!row) continue;
      try {
        out[id] = this.decodeBody(Number(row.enc), row.data);
      } catch (err: any) {
        this.log(`[store] falha ao ler conteúdo de ${id}: ${err?.message}`);
      }
    }
    return out;
  }

  /** E-mails completos (resumo + conteúdo) — usado nas cópias .pst/.mbox em Documentos. */
  getFullEmails(ids: string[]): any[] {
    if (!this.isAvailable() || !Array.isArray(ids) || ids.length === 0) return [];
    const metaStmt = this.db!.prepare('SELECT meta FROM emails WHERE id = ?');
    const bodyStmt = this.db!.prepare('SELECT enc, data FROM email_bodies WHERE id = ?');
    const out: any[] = [];
    for (const id of ids) {
      const m = metaStmt.get(id) as any;
      if (!m) continue;
      const email = JSON.parse(m.meta);
      const b = bodyStmt.get(id) as any;
      if (b) {
        try {
          Object.assign(email, this.decodeBody(Number(b.enc), b.data));
        } catch {}
      }
      delete email.bodyStored;
      out.push(email);
    }
    return out;
  }

  /** Pesquisa (FTS5): cada palavra por prefixo, todas obrigatórias, ignorando acentos. */
  search(query: string, opts?: { accountEmail?: string; folder?: string; limit?: number }) {
    const start = Date.now();
    if (!this.isAvailable() || !query || !query.trim()) return { results: [] as string[], durationMs: 0, totalFound: 0 };
    const terms = query
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/["*^():]/g, '').trim())
      .filter(Boolean)
      .slice(0, 12);
    if (terms.length === 0) return { results: [], durationMs: 0, totalFound: 0 };
    const match = terms.map((t) => `"${t}"*`).join(' ');
    const limit = Math.max(1, Math.min(opts?.limit || 100, 1000));
    const params: any[] = [match];
    let where = 'email_fts MATCH ?';
    if (opts?.accountEmail) {
      where += ' AND (e.account_email = ? OR e.account_email IS NULL)';
      params.push(opts.accountEmail.toLowerCase());
    }
    if (opts?.folder) {
      where += ' AND e.folder = ?';
      params.push(opts.folder);
    }
    try {
      const rows = this.db!
        .prepare(`SELECT e.id AS id FROM email_fts JOIN emails e ON e.rid = email_fts.rowid WHERE ${where} ORDER BY rank LIMIT ${limit}`)
        .all(...params) as any[];
      return { results: rows.map((r) => String(r.id)), durationMs: Date.now() - start, totalFound: rows.length };
    } catch (err: any) {
      this.log(`[store] erro na pesquisa: ${err?.message}`);
      return { results: [], durationMs: Date.now() - start, totalFound: 0 };
    }
  }

  /** Cópia consistente do banco para outra pasta (Configurações → Armazenamento → mudar pasta). */
  copyTo(targetDir: string): void {
    if (!this.isAvailable()) return;
    const target = this.getDbPath(targetDir);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    this.db!.prepare('VACUUM INTO ?').run(target);
  }

  close(): void {
    try {
      this.db?.close();
    } catch {}
    this.db = null;
    this.status.available = false;
  }

  /** Converte o cache antigo (arquivo único) para o banco. Retorna quantos e-mails entraram. */
  private migrateLegacyCache(legacyPath: string): number {
    if (!legacyPath || !fs.existsSync(legacyPath)) return 0;
    const buf = fs.readFileSync(legacyPath);
    let text: string;
    if (buf.subarray(0, 4).toString('utf-8') === 'ENC1') {
      if (!this.crypto) throw new Error('criptografia indisponível para ler o cache antigo');
      text = this.crypto.decrypt(buf.subarray(4));
    } else {
      text = buf.toString('utf-8');
    }
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return 0;

    // Tudo numa transação: ou converte tudo, ou nada (e o cache antigo continua valendo)
    let n = 0;
    this.transaction(() => {
      for (const email of parsed) {
        if (!email || typeof email.id !== 'string') continue;
        const s = stripEmailBody(email);
        this.upsertOne({ meta: s.meta, body: s.body, bodyHtml: s.bodyHtml, hasBody: s.hasBody });
        n++;
      }
    });

    // Guarda o arquivo antigo como cópia de segurança (não é mais lido)
    const stamp = new Date().toISOString().slice(0, 10);
    const backup = `${legacyPath}.migrado-${stamp}.bak`;
    try {
      fs.renameSync(legacyPath, backup);
      this.log(`[store] cache antigo guardado como ${path.basename(backup)}`);
    } catch (err: any) {
      this.log(`[store] não foi possível renomear o cache antigo: ${err?.message}`);
    }
    return n;
  }
}
