import { describe, expect, it } from 'vitest';
import type { EmailItem } from '../types/email';
import { addressesIn, computeAstroAgenda, followUpText, normalizeSubject } from './astroAgenda';

const NOW = new Date(2026, 10, 25, 10, 0, 0);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const ME = 'eu@anectta.com.br';

let n = 0;
function mail(p: Partial<EmailItem>): EmailItem {
  n += 1;
  return {
    id: `m${n}`,
    sender: 'Fulano',
    senderEmail: 'fulano@cliente.com.br',
    recipient: ME,
    subject: 'Assunto',
    snippet: '',
    body: '',
    timestamp: '10:00',
    period: 'today',
    folder: 'inbox',
    priority: 'medium',
    isRead: true,
    ...p,
  } as EmailItem;
}

const agenda = (emails: EmailItem[]) => computeAstroAgenda(emails, { myAddresses: [ME], now: NOW });

describe('Aguardando sua resposta', () => {
  it('entra quando há pergunta e você não respondeu', () => {
    const q = mail({ subject: 'Proposta', body: 'Olá! Você consegue me enviar a proposta até sexta?', dateStr: daysAgo(1), messageIdHeader: '<q1@cliente>' });
    const r = agenda([q]);
    expect(r.needsReply.map((i) => i.email.id)).toEqual([q.id]);
    expect(r.needsReply[0].ageDays).toBe(1);
  });

  it('sai quando você respondeu (pelo cabeçalho ou pelo assunto)', () => {
    const q1 = mail({ subject: 'Proposta', body: 'Pode me confirmar o valor?', dateStr: daysAgo(2), messageIdHeader: '<q1@cliente>' });
    const reply1 = mail({ folder: 'sent', senderEmail: ME, recipient: 'fulano@cliente.com.br', subject: 'Re: Proposta', body: 'Confirmo.', dateStr: daysAgo(1), inReplyToHeader: '<q1@cliente>' });
    const q2 = mail({ subject: 'Contrato', senderEmail: 'beltrano@x.com', body: 'Aguardo seu retorno sobre o contrato.', dateStr: daysAgo(3) });
    const reply2 = mail({ folder: 'sent', senderEmail: ME, recipient: 'Beltrano <beltrano@x.com>', subject: 'RES: Contrato', body: 'Ok', dateStr: daysAgo(2) });
    expect(agenda([q1, reply1, q2, reply2]).needsReply).toEqual([]);
  });

  it('ignora automáticos, sem pergunta e antigos', () => {
    const auto = mail({ senderEmail: 'no-reply@banco.com', body: 'Você reconhece este acesso?', dateStr: daysAgo(1) });
    const plain = mail({ body: 'Segue o relatório mensal.', dateStr: daysAgo(1) });
    const old = mail({ body: 'Pode me ligar?', dateStr: daysAgo(20) });
    expect(agenda([auto, plain, old]).needsReply).toEqual([]);
  });
});

describe('Sem resposta (follow-up)', () => {
  it('entra quando você perguntou há 3+ dias e ninguém respondeu', () => {
    const s = mail({ folder: 'sent', senderEmail: ME, recipient: 'Cliente <cliente@empresa.com>', subject: 'Orçamento', body: 'Você aprova o orçamento enviado?', dateStr: daysAgo(4), messageIdHeader: '<s1@anectta>' });
    const r = agenda([s]);
    expect(r.awaitingAnswer.map((i) => i.email.id)).toEqual([s.id]);
    expect(r.awaitingAnswer[0].ageDays).toBe(4);
  });

  it('sai quando houve resposta, quando é recente ou quando você já cobrou', () => {
    const s1 = mail({ folder: 'sent', senderEmail: ME, recipient: 'cliente@empresa.com', subject: 'Orçamento', body: 'Pode aprovar?', dateStr: daysAgo(5), messageIdHeader: '<s1@anectta>' });
    const answer = mail({ senderEmail: 'cliente@empresa.com', subject: 'Re: Orçamento', body: 'Aprovado', dateStr: daysAgo(4), inReplyToHeader: '<s1@anectta>' });
    const recent = mail({ folder: 'sent', senderEmail: ME, recipient: 'x@y.com', subject: 'Agenda', body: 'Pode amanhã?', dateStr: daysAgo(1) });
    const s3 = mail({ folder: 'sent', senderEmail: ME, recipient: 'z@w.com', subject: 'Contrato', body: 'Consegue assinar?', dateStr: daysAgo(8) });
    const s3b = mail({ folder: 'sent', senderEmail: ME, recipient: 'z@w.com', subject: 'Re: Contrato', body: 'Conseguiu ver?', dateStr: daysAgo(2) });
    expect(agenda([s1, answer, recent, s3, s3b]).awaitingAnswer).toEqual([]);
  });

  it('itens dispensados não aparecem', () => {
    const s = mail({ folder: 'sent', senderEmail: ME, recipient: 'c@e.com', subject: 'X', body: 'Pode ver?', dateStr: daysAgo(4) });
    expect(computeAstroAgenda([s], { myAddresses: [ME], now: NOW, dismissed: new Set([s.id]) }).awaitingAnswer).toEqual([]);
  });
});

describe('auxiliares', () => {
  it('normaliza assunto e extrai endereços', () => {
    expect(normalizeSubject('RES: Re: FW:  Proposta  Comercial')).toBe('proposta comercial');
    expect(addressesIn('Ana <ana@x.com>, b@y.com.br; "C" <C@Z.com>')).toEqual(['ana@x.com', 'b@y.com.br', 'c@z.com']);
    expect(followUpText('Maria Silva')).toContain('Olá, Maria,');
  });
});
