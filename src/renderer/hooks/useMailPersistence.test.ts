import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EmailItem } from '@/types/email';
import { diffEmails, buildStoreRecords, applyStrips } from './useMailPersistence';
import { stripEmailBody, isBodyStripped } from '../utils/emailBodyStrip';

const mk = (id: string, extra: Partial<EmailItem> = {}): EmailItem =>
  ({
    id,
    accountId: 'acc-1',
    sender: 'Fulano',
    senderEmail: 'f@x.com',
    recipient: 'eu@empresa.com',
    subject: `Assunto ${id}`,
    snippet: 'resumo',
    body: `texto ${id}`,
    bodyHtml: `<p>html ${id}</p><img src="cid:logo">`,
    timestamp: '10:00',
    period: 'today',
    folder: 'inbox',
    priority: 'medium',
    isRead: false,
    ...extra,
  }) as EmailItem;

describe('stripEmailBody', () => {
  it('separa o conteúdo e marca o resumo', () => {
    const s = stripEmailBody(mk('a'));
    expect(s.hasBody).toBe(true);
    expect(s.body).toBe('texto a');
    expect(s.bodyHtml).toContain('html a');
    expect(s.meta.body).toBeUndefined();
    expect(s.meta.bodyHtml).toBeUndefined();
    expect(s.meta.bodyStored).toBe(true);
    expect(isBodyStripped(s.meta)).toBe(true);
  });

  it('resumo sem conteúdo não é marcado nem perde campos', () => {
    const meta = stripEmailBody(mk('a')).meta;
    const again = stripEmailBody({ ...meta, isRead: true });
    expect(again.hasBody).toBe(false);
    expect(again.meta.bodyStored).toBe(true);
    expect(again.meta.isRead).toBe(true);
  });

  it('marca imagens de assinatura como inline usando o HTML', () => {
    const e = mk('a', {
      attachments: [
        { id: '1', name: 'logo.png', size: 100, contentType: 'image/png' },
        { id: '2', name: 'contrato.pdf', size: 100, contentType: 'application/pdf' },
      ],
      bodyHtml: '<img src="logo.png">',
    });
    const s = stripEmailBody(e);
    expect(s.meta.attachments[0].isInline).toBe(true);
    expect(s.meta.attachments[1].isInline).toBeFalsy();
  });

  it('estima o tamanho quando o servidor não informou', () => {
    expect(stripEmailBody(mk('a')).meta.sizeBytes).toBeGreaterThan(0);
    expect(stripEmailBody(mk('a', { sizeBytes: 999 })).meta.sizeBytes).toBe(999);
  });
});

describe('diffEmails / buildStoreRecords / applyStrips', () => {
  it('detecta só o que mudou e o que saiu', () => {
    const a = mk('a');
    const b = mk('b');
    const c = mk('c');
    const prev = new Map([
      ['a', a],
      ['b', b],
      ['c', c],
    ]);
    const b2 = { ...b, isRead: true };
    const d = mk('d');
    const { changed, removed } = diffEmails(prev, [a, b2, d]);
    expect(changed.map((e) => e.id).sort()).toEqual(['b', 'd']);
    expect(removed.map((e) => e.id)).toEqual(['c']);
  });

  it('nenhuma mudança → nada a gravar', () => {
    const a = mk('a');
    const { changed, removed } = diffEmails(new Map([['a', a]]), [a]);
    expect(changed).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });

  it('monta registros com conteúdo só quando o objeto tem conteúdo', () => {
    const full = mk('a');
    const light = stripEmailBody(mk('b')).meta as EmailItem;
    const { records, strips } = buildStoreRecords([full, light], () => 'eu@empresa.com');
    expect(records[0].hasBody).toBe(true);
    expect(records[0].body).toBe('texto a');
    expect(records[0].accountEmail).toBe('eu@empresa.com');
    expect(records[1].hasBody).toBe(false);
    expect(strips.has('a')).toBe(true);
    expect(strips.has('b')).toBe(false);
  });

  it('troca pelo resumo apenas se o e-mail não mudou durante a gravação', () => {
    const a = mk('a');
    const b = mk('b');
    const { strips } = buildStoreRecords([a, b], () => undefined);
    const bChanged = { ...b, isStarred: true };
    const out = applyStrips([a, bChanged], strips);
    expect(isBodyStripped(out[0])).toBe(true);
    expect(out[1]).toBe(bChanged); // alterado nesse meio-tempo: fica como está (será gravado na próxima)
  });

  it('sem trocas → devolve o mesmo array (não provoca nova renderização)', () => {
    const list = [mk('a')];
    expect(applyStrips(list, new Map())).toBe(list);
  });
});

describe('emailBodyCache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('carrega do banco sob demanda e não repete pedidos', async () => {
    const storeGetBodies = vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { body: `corpo ${id}`, bodyHtml: `<b>${id}</b>` }]))
    );
    (globalThis as any).window = { electronAPI: { storeGetBodies } };
    const cacheMod = await import('../services/emailBodyCache');
    const light = stripEmailBody(mk('x')).meta as EmailItem;

    expect(cacheMod.hydrateEmail(light)).toBe(light); // ainda não carregado
    await Promise.all([cacheMod.loadBodies(['x']), cacheMod.loadBodies(['x'])]);
    expect(storeGetBodies).toHaveBeenCalledTimes(1);

    const h1 = cacheMod.hydrateEmail(light);
    expect(h1.body).toBe('corpo x');
    expect(h1.bodyHtml).toBe('<b>x</b>');
    expect(cacheMod.hydrateEmail(light)).toBe(h1); // mesmo objeto (tela não é refeita)
    expect(light.body).toBeUndefined(); // original intacto

    const full = await cacheMod.ensureEmailBody(stripEmailBody(mk('y')).meta as EmailItem);
    expect(full.body).toBe('corpo y');
  });

  it('e-mail com conteúdo em memória não consulta o banco', async () => {
    const storeGetBodies = vi.fn();
    (globalThis as any).window = { electronAPI: { storeGetBodies } };
    const cacheMod = await import('../services/emailBodyCache');
    const full = mk('z');
    expect(await cacheMod.ensureEmailBody(full)).toBe(full);
    expect(storeGetBodies).not.toHaveBeenCalled();
  });
});
