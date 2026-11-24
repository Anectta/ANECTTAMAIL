import { describe, it, expect } from 'vitest';
import type { EmailItem } from '@/types/email';
import { removeServerDuplicates } from './emailDedupe';

const mk = (id: string, extra: Partial<EmailItem> = {}): EmailItem =>
  ({ id, accountId: 'acc', subject: 's', folder: 'inbox', sender: '', senderEmail: '', recipient: '', snippet: '', body: '', timestamp: '', period: 'today', priority: 'medium', isRead: true, ...extra }) as EmailItem;

describe('removeServerDuplicates', () => {
  it('cópia baixada de um e-mail movido pelo app sai; o do app fica', () => {
    const moved = mk('acc-imap-inbox-5', { folder: 'junk', imapLocation: { folderKey: 'junk', uid: 9 } });
    const copy = mk('acc-imap-junk-9', { folder: 'junk' });
    const r = removeServerDuplicates([moved, copy, mk('acc-imap-inbox-6')]);
    expect(r.removedIds).toEqual(['acc-imap-junk-9']);
    expect(r.emails.map((e) => e.id)).toEqual(['acc-imap-inbox-5', 'acc-imap-inbox-6']);
  });

  it('enviado: cópia local com localização + cópia do servidor → fica a local', () => {
    const local = mk('acc-msg-1', { folder: 'sent', messageIdHeader: '<a@x>', imapLocation: { folderKey: 'sent', uid: 1 } });
    const server = mk('acc-imap-sent-1', { folder: 'sent', messageIdHeader: '<a@x>' });
    const r = removeServerDuplicates([local, server]);
    expect(r.emails.map((e) => e.id)).toEqual(['acc-msg-1']);
    expect(r.removedIds).toEqual(['acc-imap-sent-1']);
  });

  it('enviado: cópia local sem localização é vinculada à do servidor', () => {
    const local = mk('acc-msg-2', { folder: 'sent', messageIdHeader: '<b@x>' });
    const server = mk('acc-imap-sent-7', { folder: 'sent', messageIdHeader: ' <b@x> ' });
    const r = removeServerDuplicates([local, server]);
    expect(r.emails).toHaveLength(1);
    expect(r.emails[0].imapLocation).toEqual({ folderKey: 'sent', uid: 7 });
    expect(r.linked.map((e) => e.id)).toEqual(['acc-msg-2']);
  });

  it('não mexe quando não há duplicados (mesmo array)', () => {
    const list = [mk('acc-imap-inbox-1'), mk('acc-msg-3', { folder: 'sent', messageIdHeader: '<c@x>' })];
    expect(removeServerDuplicates(list).emails).toBe(list);
  });

  it('duas cópias no servidor sem a local: mantém as duas (evita baixar de novo)', () => {
    const a = mk('acc-imap-sent-1', { folder: 'sent', messageIdHeader: '<d@x>' });
    const b = mk('acc-imap-sent-2', { folder: 'sent', messageIdHeader: '<d@x>' });
    expect(removeServerDuplicates([a, b]).removedIds).toEqual([]);
  });

  it('contas diferentes com o mesmo Message-ID não são duplicados', () => {
    const a = mk('acc-msg-1', { folder: 'sent', messageIdHeader: '<e@x>' });
    const b = mk('outra-imap-sent-1', { accountId: 'outra', folder: 'sent', messageIdHeader: '<e@x>' });
    expect(removeServerDuplicates([a, b]).removedIds).toEqual([]);
  });
});
