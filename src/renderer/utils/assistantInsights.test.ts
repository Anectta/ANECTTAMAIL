import { describe, expect, it } from 'vitest';
import { buildInsights, extractAmounts, extractCode, extractDates, quickReplyText } from './assistantInsights';

// Segunda-feira, 23/11/2026, 10h
const REF = new Date(2026, 10, 23, 10, 0, 0);

describe('extractDates', () => {
  it('lê dd/mm com horário e marca prazo', () => {
    const d = extractDates('Favor enviar o contrato até 28/11 às 14h.', REF);
    expect(d[0]).toMatchObject({ date: '2026-11-28', time: '14:00', isDeadline: true });
    expect(d[0].label).toBe('sáb., 28/11 às 14h');
  });

  it('lê "28 de novembro" e dias da semana', () => {
    expect(extractDates('A reunião será em 2 de dezembro de 2026, 9h30', REF)[0]).toMatchObject({
      date: '2026-12-02',
      time: '09:30',
    });
    expect(extractDates('Podemos conversar na sexta-feira às 15:00?', REF)[0]).toMatchObject({
      date: '2026-11-27',
      time: '15:00',
    });
    expect(extractDates('Te ligo amanhã', REF)[0].date).toBe('2026-11-24');
  });

  it('dd/mm sem ano já passado vira o ano seguinte; datas antigas com ano são ignoradas', () => {
    expect(extractDates('Vencimento em 10/01', REF)[0].date).toBe('2027-01-10');
    expect(extractDates('Nota emitida em 10/10/2025', REF)).toHaveLength(0);
  });

  it('não confunde valores, telefones, IPs e CPF com datas', () => {
    expect(extractDates('Total de R$ 1.250,00 e 3.5 kg', REF)).toHaveLength(0);
    expect(extractDates('Ligue 11-98765-4321, servidor 192.168.0.1', REF)).toHaveLength(0);
    expect(extractDates('CPF 123.456.789-00', REF)).toHaveLength(0);
  });

  it('não lê "2 hotéis" como horário', () => {
    expect(extractDates('Dia 30/11 2 hotéis disponíveis', REF)[0].time).toBeUndefined();
  });
});

describe('extractAmounts / extractCode', () => {
  it('valores em reais e dólares', () => {
    expect(extractAmounts('Valor: R$ 1.250,00 e taxa de R$15 — US$ 30')).toEqual(['R$ 1.250,00', 'R$ 15', 'US$ 30']);
  });
  it('código de verificação', () => {
    expect(extractCode('Seu código de verificação é: 482913')).toBe('482913');
    expect(extractCode('Your code: 123 456')).toBe('123456');
    expect(extractCode('Código promocional válido até 2026')).toBeUndefined();
  });
});

describe('buildInsights', () => {
  it('cobrança com prazo e valor', () => {
    const r = buildInsights(
      {
        subject: 'Fatura de novembro',
        body: 'Olá Carlos,\n\nSua fatura no valor de R$ 389,90 vence em 05/12.\n\nAtenciosamente',
        senderEmail: 'cobranca@empresa.com.br',
        dateStr: REF.toISOString(),
      },
      REF
    );
    expect(r.kind).toBe('payment');
    expect(r.amounts).toEqual(['R$ 389,90']);
    expect(r.nextStep).toBe('Pagar até sáb., 05/12 (R$ 389,90).');
    expect(r.keyPoint).toContain('Sua fatura');
  });

  it('pedido de resposta e anexos reais', () => {
    const r = buildInsights(
      {
        subject: 'Proposta',
        body: 'Bom dia!\nSegue a proposta revisada. Aguardo seu retorno até quinta.\n\nEm seg., 20 de nov. de 2026, Fulano escreveu:\n> Pode me enviar o valor?',
        attachments: [
          { name: 'proposta.pdf' },
          { name: 'logo.png', isSignature: true },
        ],
        dateStr: REF.toISOString(),
      },
      REF
    );
    expect(r.replyRequested).toBe(true);
    expect(r.attachments).toEqual(['proposta.pdf']);
    expect(r.keyPoint).toBe('Aguardo seu retorno até quinta.');
    expect(r.dates[0]).toMatchObject({ date: '2026-11-26', isDeadline: true });
  });

  it('aviso de segurança automático com código', () => {
    const r = buildInsights(
      {
        subject: 'Código de verificação',
        body: 'Use o código 771204 para entrar. Se não foi você, ignore.',
        senderEmail: 'no-reply@servico.com',
      },
      REF
    );
    expect(r.kind).toBe('security');
    expect(r.code).toBe('771204');
    expect(r.automated).toBe(true);
    expect(r.replyRequested).toBe(false);
  });

  it('mensagem simples: nenhuma ação', () => {
    const r = buildInsights({ subject: 'Fotos', body: 'Oi!\nAs fotos do evento ficaram ótimas, veja quando puder.' }, REF);
    expect(r.nextStep).toBe('Nenhuma ação necessária.');
    expect(r.kind).toBe('general');
  });
});

describe('quickReplyText', () => {
  it('usa o primeiro nome quando existe', () => {
    expect(quickReplyText('confirm', 'MARIA Souza')).toMatch(/^Olá, Maria,\n\nConfirmo o recebimento/);
    expect(quickReplyText('thanks', 'contato@x.com')).toMatch(/^Olá,\n\nMuito obrigado/);
  });
});
