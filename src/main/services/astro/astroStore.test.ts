import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { AstroStore, type AstroCipher } from './astroStore';
import { DEFAULT_ASTRO_REPLY_CONFIG, normalizeAstroReplyConfig } from '../../../shared/astro/replyConfig';

const cipher: AstroCipher = {
  encode: (v) => ({ enc: 1, data: Uint8Array.from(Buffer.from(JSON.stringify(v), 'utf-8')).reverse() }),
  decode: (_e, d) => JSON.parse(Buffer.from(Uint8Array.from(d).reverse()).toString('utf-8')),
};

describe('banco do Astro: configuração, registro e aprovações', () => {
  it('configuração por conta (desligada até salvar)', () => {
    const store = new AstroStore(new DatabaseSync(':memory:'), cipher);
    expect(store.getConfigRaw('eu@x.com')).toBeNull();
    const cfg = normalizeAstroReplyConfig({ ...DEFAULT_ASTRO_REPLY_CONFIG, autonomy: 'rascunho' }, 100);
    store.saveConfig('Eu@X.com', cfg, 100);
    expect(store.getConfigRaw('eu@x.com')).toMatchObject({ autonomy: 'rascunho', minConfidence: 0.7, maxAutoPerDay: 30 });
  });

  it('registra cada decisão uma vez por e-mail e não aceita "enviado" por esse caminho', () => {
    const db = new DatabaseSync(':memory:');
    const store = new AstroStore(db, cipher);
    store.logDecision('eu@x.com', 't1', 'e1', 'salvar_rascunho', ['anexo'], 1);
    store.logDecision('eu@x.com', 't1', 'e1', 'salvar_rascunho', ['anexo'], 2);
    expect((db.prepare('SELECT count(*) AS c FROM astro_auto_reply_log').get() as any).c).toBe(1);
    expect(() => store.logDecision('eu@x.com', 't1', 'e1', 'enviado', [], 3)).toThrow();
  });

  it('conta envios do dia e da conversa', () => {
    const db = new DatabaseSync(':memory:');
    const store = new AstroStore(db, cipher);
    const ins = db.prepare("INSERT INTO astro_auto_reply_log (account_email, thread_key, inbound_id, action, created_ms) VALUES ('eu@x.com', ?, ?, 'enviado', ?)");
    ins.run('t1', 'e1', 1000);
    ins.run('t2', 'e2', 5000);
    expect(store.countAutoSentSince('eu@x.com', 2000)).toBe(1);
    expect(store.countAutoSentInThread('EU@x.com', 't1')).toBe(1);
    expect(store.countAutoSentInThread('eu@x.com', 't3')).toBe(0);
  });

  it('aprovações: conta um por e-mail e guarda o conteúdo cifrado', () => {
    const db = new DatabaseSync(':memory:');
    const store = new AstroStore(db, cipher);
    expect(store.insertFeedback('eu@x.com', 'e1', { suggested: 'Olá Ana', sent: 'Olá Ana' }, true, 1)).toBe(1);
    expect(store.insertFeedback('eu@x.com', 'e1', { suggested: 'Olá Ana', sent: 'Olá Ana!' }, true, 2)).toBe(1);
    expect(store.insertFeedback('eu@x.com', 'e2', { suggested: 'a', sent: 'outra coisa' }, false, 3)).toBe(1);
    expect(store.insertFeedback('eu@x.com', 'e3', { suggested: 'b', sent: 'b' }, true, 4)).toBe(2);
    const raw = db.prepare('SELECT data FROM astro_feedback LIMIT 1').get() as any;
    expect(Buffer.from(raw.data).toString('utf-8')).not.toContain('Olá Ana');
    store.clearLearning('eu@x.com');
    expect(store.countApprovedDrafts('eu@x.com')).toBe(0);
  });

  it('atualiza bancos antigos (sem a coluna "approved")', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE astro_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, account_email TEXT NOT NULL, inbound_id TEXT NOT NULL, created_ms INTEGER NOT NULL, enc INTEGER NOT NULL, data BLOB NOT NULL)');
    const store = new AstroStore(db, cipher);
    expect(store.insertFeedback('eu@x.com', 'e1', { a: 1 }, true, 1)).toBe(1);
  });
});
