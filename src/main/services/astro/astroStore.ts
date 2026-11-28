/**
 * Astro Respostas Inteligentes — tabelas no banco local (node:sqlite).
 *
 * Regra de privacidade: todo texto de e-mail ou de estilo é gravado cifrado (mesma cifra do
 * conteúdo dos e-mails: proteção do Windows via safeStorage). Só IDs e datas ficam abertos.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { StyleProfile } from './styleProfile';

export interface AstroCipher {
  /** Cifra um objeto (JSON). enc = 1 quando cifrado, 0 quando a cifra não está disponível. */
  encode: (value: unknown) => { enc: number; data: Uint8Array };
  decode: (enc: number, data: Uint8Array) => unknown;
}

/** Conteúdo cifrado de um par histórico. */
export interface PairContent {
  /** Pergunta pura (texto do e-mail recebido, sem citação/assinatura). */
  question: string;
  /** Resposta pura (seu texto, sem saudação/despedida/assinatura/citação). */
  answer: string;
  /** Assunto normalizado. */
  subject: string;
  /** Endereço de quem perguntou (usado só para o anti-vazamento). */
  counterpart: string;
}

export interface StoredPair extends PairContent {
  id: number;
  inboundId: string;
  outboundId: string;
  threadKey: string;
  category: string | null;
  inDateMs: number;
  outDateMs: number;
  uses: number;
}

export const ASTRO_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS astro_knowledge_pairs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_email TEXT NOT NULL,
    inbound_id    TEXT NOT NULL,
    outbound_id   TEXT NOT NULL,
    thread_key    TEXT NOT NULL,
    category      TEXT,
    in_date_ms    INTEGER,
    out_date_ms   INTEGER,
    enc           INTEGER NOT NULL,
    data          BLOB NOT NULL,
    uses          INTEGER NOT NULL DEFAULT 0,
    UNIQUE(inbound_id, outbound_id)
  );
  CREATE INDEX IF NOT EXISTS idx_astro_pairs_account ON astro_knowledge_pairs(account_email, out_date_ms DESC);

  CREATE TABLE IF NOT EXISTS astro_user_style_profile (
    account_email TEXT PRIMARY KEY,
    version       INTEGER NOT NULL,
    sample_count  INTEGER NOT NULL,
    updated_ms    INTEGER NOT NULL,
    enc           INTEGER NOT NULL,
    data          BLOB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS astro_auto_reply_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_email TEXT NOT NULL,
    thread_key    TEXT NOT NULL,
    inbound_id    TEXT NOT NULL,
    action        TEXT NOT NULL,
    triggers      TEXT,
    sent_msg_id   TEXT,
    created_ms    INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_astro_one_auto_per_thread
    ON astro_auto_reply_log(account_email, thread_key) WHERE action = 'enviado';
  CREATE INDEX IF NOT EXISTS idx_astro_log_day ON astro_auto_reply_log(account_email, created_ms);

  CREATE TABLE IF NOT EXISTS astro_feedback (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_email TEXT NOT NULL,
    inbound_id    TEXT NOT NULL,
    created_ms    INTEGER NOT NULL,
    enc           INTEGER NOT NULL,
    data          BLOB NOT NULL
  );
`;

const acc = (email: string) => email.trim().toLowerCase();

export class AstroStore {
  constructor(private readonly db: DatabaseSync, private readonly cipher: AstroCipher) {
    db.exec(ASTRO_SCHEMA_SQL);
  }

  /** IDs das respostas já transformadas em par (para não reprocessar). */
  knownOutboundIds(accountEmail: string): Set<string> {
    const rows = this.db
      .prepare('SELECT outbound_id FROM astro_knowledge_pairs WHERE account_email = ?')
      .all(acc(accountEmail)) as Array<{ outbound_id: string }>;
    return new Set(rows.map((r) => String(r.outbound_id)));
  }

  /** Grava um par (ignora se já existir). Retorna true quando inseriu. */
  insertPair(
    accountEmail: string,
    meta: { inboundId: string; outboundId: string; threadKey: string; inDateMs: number; outDateMs: number; category?: string | null },
    content: PairContent
  ): boolean {
    const { enc, data } = this.cipher.encode(content);
    const r = this.db
      .prepare(
        `INSERT OR IGNORE INTO astro_knowledge_pairs
         (account_email, inbound_id, outbound_id, thread_key, category, in_date_ms, out_date_ms, enc, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(acc(accountEmail), meta.inboundId, meta.outboundId, meta.threadKey, meta.category ?? null, meta.inDateMs, meta.outDateMs, enc, data);
    return Number(r.changes) > 0;
  }

  /** Pares de uma conta, já decifrados (mais recentes primeiro). */
  listPairs(accountEmail: string, limit = 5000): StoredPair[] {
    const rows = this.db
      .prepare(
        `SELECT id, inbound_id, outbound_id, thread_key, category, in_date_ms, out_date_ms, uses, enc, data
         FROM astro_knowledge_pairs WHERE account_email = ? ORDER BY out_date_ms DESC LIMIT ?`
      )
      .all(acc(accountEmail), limit) as any[];
    const out: StoredPair[] = [];
    for (const r of rows) {
      try {
        const c = this.cipher.decode(Number(r.enc), r.data) as PairContent;
        out.push({
          id: Number(r.id),
          inboundId: String(r.inbound_id),
          outboundId: String(r.outbound_id),
          threadKey: String(r.thread_key),
          category: r.category ?? null,
          inDateMs: Number(r.in_date_ms),
          outDateMs: Number(r.out_date_ms),
          uses: Number(r.uses),
          question: c.question,
          answer: c.answer,
          subject: c.subject,
          counterpart: c.counterpart,
        });
      } catch {
        // Par ilegível (ex.: cifra de outro usuário do Windows) — ignora
      }
    }
    return out;
  }

  countPairs(accountEmail: string): number {
    const row = this.db.prepare('SELECT count(*) AS c FROM astro_knowledge_pairs WHERE account_email = ?').get(acc(accountEmail)) as any;
    return Number(row?.c || 0);
  }

  saveProfile(accountEmail: string, profile: StyleProfile): void {
    const { enc, data } = this.cipher.encode(profile);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO astro_user_style_profile (account_email, version, sample_count, updated_ms, enc, data)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(acc(accountEmail), profile.version, profile.sampleCount, profile.updatedMs, enc, data);
  }

  getProfile(accountEmail: string): StyleProfile | null {
    const row = this.db.prepare('SELECT enc, data FROM astro_user_style_profile WHERE account_email = ?').get(acc(accountEmail)) as any;
    if (!row) return null;
    try {
      return this.cipher.decode(Number(row.enc), row.data) as StyleProfile;
    } catch {
      return null;
    }
  }

  /** "Apagar o que o Astro aprendeu": pares, perfil e aprendizado da conta (o registro de envios fica). */
  clearLearning(accountEmail: string): void {
    const a = acc(accountEmail);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM astro_knowledge_pairs WHERE account_email = ?').run(a);
      this.db.prepare('DELETE FROM astro_user_style_profile WHERE account_email = ?').run(a);
      this.db.prepare('DELETE FROM astro_feedback WHERE account_email = ?').run(a);
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }
}
