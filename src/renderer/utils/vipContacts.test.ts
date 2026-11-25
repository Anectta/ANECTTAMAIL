import { describe, expect, it } from 'vitest';
import type { EmailItem } from '../types/email';
import { computeVipSuggestions } from './vipContacts';

const NOW = new Date(2026, 10, 25, 10, 0, 0);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const ME = 'eu@anectta.com.br';
let n = 0;
const mail = (p: Partial<EmailItem>) =>
  ({ id: `v${++n}`, sender: '', senderEmail: '', recipient: ME, subject: 'x', snippet: '', body: '', timestamp: '', period: 'older', folder: 'inbox', priority: 'medium', isRead: true, dateStr: daysAgo(5), ...p } as EmailItem);
const sentTo = (to: string, k: number) => Array.from({ length: k }, () => mail({ folder: 'sent', senderEmail: ME, recipient: to }));
const from = (email: string, name: string, k: number) => Array.from({ length: k }, () => mail({ senderEmail: email, sender: name }));

const suggest = (emails: EmailItem[], vips = new Set<string>(), dismissed = new Set<string>()) =>
  computeVipSuggestions(emails, { myAddresses: [ME], vips, dismissed, now: NOW });

describe('sugestões de VIP', () => {
  it('sugere quem troca mensagens nos dois sentidos, em ordem', () => {
    const emails = [
      ...sentTo('Ana Lima <ana@cliente.com>', 6), ...from('ana@cliente.com', 'Ana Lima', 4),
      ...sentTo('bruno@fornecedor.com', 3), ...from('bruno@fornecedor.com', 'Bruno', 2),
    ];
    const r = suggest(emails);
    expect(r.map((s) => s.email)).toEqual(['ana@cliente.com', 'bruno@fornecedor.com']);
    expect(r[0]).toMatchObject({ name: 'Ana Lima', sentByMe: 6, receivedFromThem: 4 });
  });

  it('ignora conversa de mão única, automáticos, VIPs atuais e dispensados', () => {
    const emails = [
      ...from('loja@loja.com', 'Loja', 30), // só recebe
      ...sentTo('no-reply@sistema.com', 5), ...from('no-reply@sistema.com', 'Sistema', 5),
      ...sentTo('ja@vip.com', 5), ...from('ja@vip.com', 'Já VIP', 5),
      ...sentTo('nao@quero.com', 5), ...from('nao@quero.com', 'Não', 5),
      ...sentTo('antigo@x.com', 5).map((e) => ({ ...e, dateStr: daysAgo(200) })), ...from('antigo@x.com', 'Antigo', 5),
    ];
    expect(suggest(emails, new Set(['ja@vip.com']), new Set(['nao@quero.com']))).toEqual([]);
  });
});
