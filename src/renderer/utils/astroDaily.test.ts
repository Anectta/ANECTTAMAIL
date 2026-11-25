import { describe, expect, it } from 'vitest';
import type { EmailItem } from '../types/email';
import { computeDailyDigest } from './astroDaily';

// Quarta, 25/11/2026, 9h
const NOW = new Date(2026, 10, 25, 9, 0, 0);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
let n = 0;
const mail = (p: Partial<EmailItem>) =>
  ({ id: `d${++n}`, sender: 'X', senderEmail: 'x@empresa.com', recipient: 'eu@a.com', subject: '', snippet: '', body: '', timestamp: '', period: 'older', folder: 'inbox', priority: 'medium', isRead: true, dateStr: daysAgo(1), ...p } as EmailItem);

describe('Resumo do dia', () => {
  it('prazos de pagamento dos próximos 7 dias (e vencidos há até 3 dias), com valor', () => {
    const emails = [
      mail({ subject: 'Fatura de dezembro', body: 'Sua fatura de R$ 389,90 vence em 27/11.' }),
      mail({ subject: 'Boleto atrasado', body: 'O boleto de R$ 120,00 venceu em 23/11.', dateStr: daysAgo(5) }),
      mail({ subject: 'Fatura de janeiro', body: 'Vencimento em 20/12.' }), // longe demais
    ];
    const d = computeDailyDigest(emails, { now: NOW });
    expect(d.payments.map((p) => [p.date, p.amount, Boolean(p.overdue)])).toEqual([
      ['2026-11-23', 'R$ 120,00', true],
      ['2026-11-27', 'R$ 389,90', false],
    ]);
  });

  it('reuniões de hoje e amanhã', () => {
    const emails = [
      mail({ subject: 'Reunião de alinhamento', body: 'Podemos fazer a reunião amanhã às 14h?' }),
      mail({ subject: 'Reunião trimestral', body: 'A reunião será em 10/12 às 10h.' }),
    ];
    const d = computeDailyDigest(emails, { now: NOW });
    expect(d.meetings).toHaveLength(1);
    // O e-mail é de ontem: "amanhã" nele significa hoje
    expect(d.meetings[0].date).toBe('2026-11-25');
  });

  it('não lidos de VIP e newsletters acumuladas', () => {
    const emails = [
      mail({ senderEmail: 'ana@cliente.com', isRead: false }),
      mail({ senderEmail: 'ana@cliente.com', isRead: true }),
      mail({ senderEmail: 'news@loja.com', isRead: false, listUnsubscribe: '<https://loja.com/sair>' }),
      mail({ senderEmail: 'news@loja.com', isRead: false, listUnsubscribe: '<https://loja.com/sair>' }),
    ];
    const d = computeDailyDigest(emails, { now: NOW, vips: new Set(['ana@cliente.com']) });
    expect(d.vipUnread).toHaveLength(1);
    expect(d.newslettersUnread).toBe(2);
  });
});
