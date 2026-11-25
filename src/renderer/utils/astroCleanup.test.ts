import { describe, expect, it } from 'vitest';
import type { EmailItem } from '../types/email';
import { computeCleanupSuggestions } from './astroCleanup';

const NOW = new Date(2026, 10, 25, 10, 0, 0);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const ME = 'eu@anectta.com.br';

let n = 0;
function mail(p: Partial<EmailItem>): EmailItem {
  n += 1;
  return {
    id: `c${n}`,
    sender: 'Loja Exemplo',
    senderEmail: 'ofertas@loja.com.br',
    recipient: ME,
    subject: 'Oferta',
    snippet: '',
    body: '',
    timestamp: '10:00',
    period: 'older',
    folder: 'inbox',
    priority: 'low',
    isRead: false,
    ...p,
  } as EmailItem;
}

const many = (count: number, p: Partial<EmailItem>) =>
  Array.from({ length: count }, (_, i) => mail({ dateStr: daysAgo(i + 1), ...p }));

const suggest = (emails: EmailItem[], kept?: Set<string>) =>
  computeCleanupSuggestions(emails, { myAddresses: [ME], now: NOW, keptSenders: kept });

describe('Sugestão de limpeza', () => {
  it('sugere remetente com 5+ e-mails em 30 dias e nenhum aberto', () => {
    const loja = many(6, { listUnsubscribe: '<https://loja.com.br/sair>' });
    const antigo = mail({ dateStr: daysAgo(60) }); // fora da janela, mas também seria arquivado
    const r = suggest([...loja, antigo]);
    expect(r).toHaveLength(1);
    expect(r[0].senderEmail).toBe('ofertas@loja.com.br');
    expect(r[0].count).toBe(6);
    expect(r[0].inboxIds).toHaveLength(7);
    expect(r[0].canUnsubscribe).toBe(true);
  });

  it('tolera 1 aberto quando o remetente mandou 6 ou mais', () => {
    const r = suggest([...many(5, { senderEmail: 'a@x.com' }), mail({ senderEmail: 'a@x.com', isRead: true, dateStr: daysAgo(2) })]);
    expect(r).toHaveLength(1);
    expect(r[0].opened).toBe(1);
  });

  it('não sugere se você abriu mais, se são poucos ou se você já escreveu para a pessoa', () => {
    const abriuUm = [
      ...many(5, { senderEmail: 'a@x.com' }),
      mail({ senderEmail: 'a@x.com', isRead: true, dateStr: daysAgo(2) }),
      mail({ senderEmail: 'a@x.com', isRead: true, dateStr: daysAgo(3) }),
    ];
    const cincoUmAberto = [...many(4, { senderEmail: 'd@x.com' }), mail({ senderEmail: 'd@x.com', isRead: true, dateStr: daysAgo(2) })];
    const poucos = many(4, { senderEmail: 'b@x.com' });
    const contato = [
      ...many(8, { senderEmail: 'cliente@empresa.com' }),
      mail({ folder: 'sent', senderEmail: ME, recipient: 'Cliente <cliente@empresa.com>', dateStr: daysAgo(90) }),
    ];
    expect(suggest([...abriuUm, ...cincoUmAberto, ...poucos, ...contato])).toEqual([]);
  });

  it('ignora remetentes mantidos e e-mails fora da Caixa de Entrada', () => {
    const mantido = many(6, { senderEmail: 'news@site.com' });
    const noArquivo = many(6, { senderEmail: 'promo@site.com', folder: 'archive' });
    expect(suggest([...mantido, ...noArquivo], new Set(['news@site.com']))).toEqual([]);
  });

  it('ordena pelos que mais mandam', () => {
    const r = suggest([...many(5, { senderEmail: 'a@x.com' }), ...many(9, { senderEmail: 'b@x.com' })]);
    expect(r.map((s) => s.senderEmail)).toEqual(['b@x.com', 'a@x.com']);
  });
});
