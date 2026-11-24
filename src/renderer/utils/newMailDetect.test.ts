import { describe, it, expect } from 'vitest';
import type { EmailItem } from '@/types/email';
import { pickNewArrivals, buildNewMailNotice } from './newMailDetect';

const NOW = new Date('2026-11-24T12:00:00Z').getTime();
const mk = (id: string, extra: Partial<EmailItem> = {}): EmailItem =>
  ({
    id,
    accountId: 'acc',
    sender: 'Fulano',
    senderEmail: 'fulano@x.com',
    recipient: 'eu@empresa.com',
    subject: `Assunto ${id}`,
    snippet: 'resumo',
    body: '',
    timestamp: '',
    dateStr: new Date(NOW - 60_000).toISOString(),
    period: 'today',
    folder: 'inbox',
    priority: 'medium',
    isRead: false,
    ...extra,
  }) as EmailItem;

const opts = { accountHadMail: true, accountEmail: 'eu@empresa.com', now: NOW };

describe('pickNewArrivals', () => {
  it('avisa só e-mail novo, não lido, na Caixa de Entrada', () => {
    const list = [
      mk('novo'),
      mk('ja-tinha'),
      mk('lido', { isRead: true }),
      mk('spam', { folder: 'junk' }),
      mk('enviado', { folder: 'sent' }),
    ];
    const r = pickNewArrivals(list, new Set(['ja-tinha']), opts);
    expect(r.map((e) => e.id)).toEqual(['novo']);
  });

  it('não avisa e-mail enviado pela própria conta', () => {
    const r = pickNewArrivals([mk('meu', { senderEmail: 'Eu@Empresa.com ' })], new Set(), opts);
    expect(r).toHaveLength(0);
  });

  it('não avisa e-mail antigo recuperado pela sincronização', () => {
    const old = mk('antigo', { dateStr: new Date(NOW - 10 * 86400000).toISOString() });
    expect(pickNewArrivals([old], new Set(), opts)).toHaveLength(0);
  });

  it('na configuração inicial da conta (sem e-mails no app) não avisa nada', () => {
    expect(pickNewArrivals([mk('a'), mk('b')], new Set(), { ...opts, accountHadMail: false })).toHaveLength(0);
  });

  it('usa a data de recebimento quando existe', () => {
    const e = mk('x', {
      dateStr: new Date(NOW - 10 * 86400000).toISOString(),
      receivedDateStr: new Date(NOW - 3600000).toISOString(),
    });
    expect(pickNewArrivals([e], new Set(), opts)).toHaveLength(1);
  });
});

describe('buildNewMailNotice', () => {
  it('um e-mail: remetente e assunto dele', () => {
    const n = buildNewMailNotice([mk('a', { sender: 'Maria', subject: 'Proposta' })])!;
    expect(n).toMatchObject({ id: 'a', sender: 'Maria', subject: 'Proposta', count: 1 });
  });

  it('vários: um único aviso com a contagem e o mais recente', () => {
    const n = buildNewMailNotice([
      mk('a', { sender: 'Maria', dateStr: new Date(NOW - 5000).toISOString() }),
      mk('b', { sender: 'João', subject: 'Contrato', dateStr: new Date(NOW - 1000).toISOString() }),
      mk('c', { sender: 'Maria', dateStr: new Date(NOW - 9000).toISOString() }),
    ])!;
    expect(n.id).toBe('b');
    expect(n.count).toBe(3);
    expect(n.sender).toBe('João e mais 1 remetente');
    expect(n.subject).toBe('Último: Contrato');
    expect(n.snippet).toBe('3 novos e-mails na Caixa de Entrada');
  });

  it('lista vazia: sem aviso', () => {
    expect(buildNewMailNotice([])).toBeNull();
  });
});
