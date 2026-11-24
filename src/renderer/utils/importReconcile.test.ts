import { describe, it, expect } from 'vitest';
import type { EmailItem } from '@/types/email';
import { dropPop3AlreadyImported, replaceImportedWithServerCopies, normalizeMessageId } from './importReconcile';

const mk = (id: string, msgId?: string, extra: Partial<EmailItem> = {}): EmailItem =>
  ({
    id,
    accountId: 'acc',
    messageIdHeader: msgId,
    sender: '',
    senderEmail: '',
    recipient: '',
    subject: 's',
    snippet: '',
    body: '',
    timestamp: '',
    period: 'today',
    folder: 'inbox',
    priority: 'medium',
    isRead: true,
    ...extra,
  }) as EmailItem;

describe('normalizeMessageId', () => {
  it('ignora < > , espaços e maiúsculas', () => {
    expect(normalizeMessageId(' <ABC@Ex.com> ')).toBe('abc@ex.com');
    expect(normalizeMessageId(undefined)).toBe('');
  });
});

describe('POP3: não baixa de novo o que foi importado', () => {
  const existing = [mk('acc-imported-1', '<a@x>', { importedFrom: 'pst' }), mk('acc-pop3-old', '<b@x>')];

  it('descarta a mensagem já importada e mantém as novas', () => {
    const incoming = [mk('acc-pop3-uidl-1', '<A@X>'), mk('acc-pop3-uidl-2', '<c@x>')];
    const r = dropPop3AlreadyImported(incoming, existing, 'acc');
    expect(r.kept.map((e) => e.id)).toEqual(['acc-pop3-uidl-2']);
    expect(r.dropped.map((e) => e.id)).toEqual(['acc-pop3-uidl-1']);
  });

  it('só compara com e-mails importados da mesma conta', () => {
    const incoming = [mk('x', '<b@x>')]; // <b@x> existe, mas não é importado
    expect(dropPop3AlreadyImported(incoming, existing, 'acc').dropped).toHaveLength(0);
    const other = [mk('outra-imported', '<z@x>', { accountId: 'outra', importedFrom: 'mbox' })];
    expect(dropPop3AlreadyImported([mk('y', '<z@x>')], other, 'acc').dropped).toHaveLength(0);
  });

  it('sem Message-ID: não descarta', () => {
    expect(dropPop3AlreadyImported([mk('y')], existing, 'acc').kept).toHaveLength(1);
  });
});

describe('IMAP: a cópia do servidor substitui a importada', () => {
  it('remove a importada quando chega a do servidor', () => {
    const prev = [mk('acc-imported-1', '<a@x>', { importedFrom: 'pst' }), mk('acc-imap-inbox-9', '<b@x>')];
    const r = replaceImportedWithServerCopies(prev, [mk('acc-imap-inbox-10', '<a@x>')], 'acc');
    expect(r.removedIds).toEqual(['acc-imported-1']);
    expect(r.prev.map((e) => e.id)).toEqual(['acc-imap-inbox-9']);
  });

  it('sem coincidência: mesmo array', () => {
    const prev = [mk('acc-imported-1', '<a@x>', { importedFrom: 'pst' })];
    expect(replaceImportedWithServerCopies(prev, [mk('n', '<q@x>')], 'acc').prev).toBe(prev);
  });
});
