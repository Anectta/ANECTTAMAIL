import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  cleanEmailText,
  htmlToPlain,
  isClosingLine,
  splitGreetingAndClosing,
  stripQuotedText,
  stripSignature,
} from '../../../shared/astro/textClean';
import { buildHistoryPairs, type PairableMeta } from '../../../shared/astro/pairing';
import { detectSignatureLines, extractStyleProfile, isSafePhrase, templateGreeting } from '../../../shared/astro/styleProfile';
import { AstroStore, type AstroCipher } from './astroStore';
import { runLearning, type LearningStatus } from './astroLearning';

// ---------------------------------------------------------------- limpeza

describe('limpeza: histórico citado', () => {
  it('Gmail em português ("Em ..., Fulano <x> escreveu:")', () => {
    const t = 'Pode ser às 15h.\n\nEm qua., 26 de nov. de 2026 às 10:12, Ana Souza <ana@cliente.com> escreveu:\n> Podemos marcar amanhã?\n> Ana';
    expect(stripQuotedText(t).trim()).toBe('Pode ser às 15h.');
  });
  it('cabeçalho quebrado em duas linhas', () => {
    const t = 'Confirmado.\n\nEm qua., 26 de nov. de 2026 às 10:12, Ana Souza\n<ana@cliente.com> escreveu:\n> texto';
    expect(stripQuotedText(t).trim()).toBe('Confirmado.');
  });
  it('inglês e espanhol', () => {
    expect(stripQuotedText('Sure!\nOn Wed, Nov 26, 2026 at 10:12 AM Bob <b@x.com> wrote:\n> hi').trim()).toBe('Sure!');
    expect(stripQuotedText('Listo.\nEl mié, 26 nov 2026 a las 10:12, Ana (<a@x.com>) escribió:\n> hola').trim()).toBe('Listo.');
  });
  it('Outlook: "De: ... Enviado: ..." e separador', () => {
    const t = 'Segue o valor atualizado.\n\nDe: Ana Souza <ana@cliente.com>\nEnviado: quarta-feira, 26 de novembro de 2026 10:12\nPara: Eu\nAssunto: Proposta';
    expect(stripQuotedText(t).trim()).toBe('Segue o valor atualizado.');
    expect(stripQuotedText('Ok\n________________________________\nDe: x').trim()).toBe('Ok');
    expect(stripQuotedText('Ok\n-----Original Message-----\nFrom: x').trim()).toBe('Ok');
  });
  it('não corta um texto que só menciona "De:" no meio', () => {
    const t = 'De: segunda a sexta, das 9h às 18h.\nAtendemos também aos sábados.';
    expect(stripQuotedText(t)).toBe(t);
  });
  it('HTML: corta no bloco citado (Gmail / Outlook / blockquote)', () => {
    expect(htmlToPlain('<div>Pode ser.</div><div class="gmail_quote"><div>Em ... escreveu:</div><blockquote>antigo</blockquote></div>')).toBe('Pode ser.');
    expect(htmlToPlain('<p>Confirmado.</p><div id="divRplyFwdMsg"><b>De:</b> Ana</div><div>antigo</div>')).toBe('Confirmado.');
    expect(htmlToPlain('<p>Ok</p><blockquote type="cite">antigo</blockquote>')).toBe('Ok');
    expect(htmlToPlain('<p>Olá&nbsp;Ana,</p><p>Segue&#8199;&#847; o link.</p>')).toBe('Olá Ana,\nSegue o link.');
  });
});

describe('limpeza: assinatura', () => {
  it('delimitador "-- ", "Enviado do meu iPhone" e aviso legal no final', () => {
    expect(stripSignature('Ok, combinado.\n-- \nCarlos\nDiretor')).toBe('Ok, combinado.');
    expect(stripSignature('Pode enviar.\n\nEnviado do meu iPhone')).toBe('Pode enviar.');
    expect(stripSignature('Pode enviar.\nSent from my Android')).toBe('Pode enviar.');
    expect(stripSignature('Recebido, obrigado.\nAbraço\nEsta mensagem é confidencial e destinada apenas ao destinatário.')).toBe('Recebido, obrigado.\nAbraço');
  });
  it('remove a assinatura conhecida do usuário', () => {
    expect(stripSignature('Pode ser.\nAbraço,\nCarlos Lima\nGerente Comercial | (11) 4000-0000', ['Carlos Lima', 'Gerente Comercial | (11) 4000-0000'])).toBe('Pode ser.\nAbraço,');
  });
  it('texto completo (HTML preferido quando o texto vem vazio)', () => {
    expect(cleanEmailText({ body: '', bodyHtml: '<div>Fechado!</div><div class="gmail_quote">x</div>' })).toBe('Fechado!');
    expect(cleanEmailText({ body: 'Fechado!\n\nEm seg., Ana <a@x.com> escreveu:\n> x' })).toBe('Fechado!');
  });
});

describe('saudação e despedida', () => {
  it('separa saudação, corpo, despedida e nome', () => {
    const r = splitGreetingAndClosing('Olá Ana,\nPode ser amanhã às 15h.\nAbraço,\nCarlos');
    expect(r).toEqual({ greeting: 'Olá Ana,', body: 'Pode ser amanhã às 15h.', closing: 'Abraço,', signoff: ['Carlos'] });
  });
  it('despedida só vale quando depois dela vem no máximo um nome', () => {
    expect(isClosingLine('Abraços, João Silva')).toBe(true);
    expect(isClosingLine('Att.')).toBe(true);
    expect(isClosingLine('Obrigado pela atenção!')).toBe(true);
    expect(isClosingLine('Obrigado pelo retorno, vou verificar e te aviso')).toBe(false);
    expect(isClosingLine('Abrangente demais')).toBe(false);
  });
});

// ---------------------------------------------------------------- pareamento

const iso = (h: number) => new Date(Date.UTC(2026, 10, 20, h)).toISOString();
const inbound = (id: string, mid: string, over: Partial<PairableMeta> = {}): PairableMeta => ({
  id,
  folder: 'inbox',
  senderEmail: 'cliente@cliente.com',
  subject: 'Pedido',
  messageIdHeader: `<${mid}>`,
  receivedDateStr: iso(10),
  ...over,
});
const outbound = (id: string, parent: string | undefined, over: Partial<PairableMeta> = {}): PairableMeta => ({
  id,
  folder: 'sent',
  senderEmail: 'eu@empresa.com',
  subject: 'Re: Pedido',
  messageIdHeader: `<${id}@empresa.com>`,
  inReplyToHeader: parent ? `<${parent}>` : undefined,
  dateStr: iso(12),
  ...over,
});

describe('pareamento pelos cabeçalhos MIME', () => {
  it('liga a resposta ao e-mail pelo In-Reply-To = Message-ID', () => {
    const pairs = buildHistoryPairs([inbound('in1', 'a@c.com'), outbound('out1', 'a@c.com')], ['eu@empresa.com']);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ inboundId: 'in1', outboundId: 'out1', threadKey: 'mid:a@c.com' });
  });
  it('sem In-Reply-To, usa o último ID do References', () => {
    const pairs = buildHistoryPairs(
      [inbound('in1', 'b@c.com'), outbound('out1', undefined, { referencesHeader: ['<raiz@c.com>', '<b@c.com>'] })],
      ['eu@empresa.com']
    );
    expect(pairs[0]?.inboundId).toBe('in1');
  });
  it('ignora no-reply, newsletters, encaminhamentos, respostas fora de ordem e muito tardias', () => {
    const me = ['eu@empresa.com'];
    expect(buildHistoryPairs([inbound('i', 'x@c', { senderEmail: 'no-reply@banco.com' }), outbound('o', 'x@c')], me)).toEqual([]);
    expect(buildHistoryPairs([inbound('i', 'x@c', { listUnsubscribe: '<https://x>' }), outbound('o', 'x@c')], me)).toEqual([]);
    expect(buildHistoryPairs([inbound('i', 'x@c'), outbound('o', 'x@c', { subject: 'Fwd: Pedido' })], me)).toEqual([]);
    expect(buildHistoryPairs([inbound('i', 'x@c', { receivedDateStr: iso(14) }), outbound('o', 'x@c')], me)).toEqual([]);
    const late = new Date(Date.UTC(2027, 0, 30)).toISOString();
    expect(buildHistoryPairs([inbound('i', 'x@c'), outbound('o', 'x@c', { dateStr: late })], me)).toEqual([]);
  });
  it('para o mesmo e-mail, fica só a primeira resposta; enviado reconhecido também pelo remetente', () => {
    const pairs = buildHistoryPairs(
      [inbound('i', 'x@c'), outbound('o2', 'x@c', { dateStr: iso(15) }), outbound('o1', 'x@c', { dateStr: iso(11), folder: 'inbox' })],
      ['EU@empresa.com']
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].outboundId).toBe('o1');
  });
});

// ---------------------------------------------------------------- estilo

describe('"DNA de escrita"', () => {
  const sent = [
    'Olá Ana,\nPode ser amanhã às 15h.\nFico à disposição para qualquer dúvida.\nAbraço,\nCarlos Lima\nGerente Comercial',
    'Olá Bruno,\nRecebido, obrigado.\nFico à disposição para qualquer dúvida.\nAbraço,\nCarlos Lima\nGerente Comercial',
    'Olá Carla,\nVou verificar e te retorno ainda hoje.\nFico à disposição para qualquer dúvida.\nAbraços,\nCarlos Lima\nGerente Comercial',
    'Bom dia, Daniel!\nSegue a proposta em anexo para sua análise.\nFico à disposição para qualquer dúvida.\nAbraço,\nCarlos Lima\nGerente Comercial',
  ];

  it('saudação vira modelo com {nome}', () => {
    expect(templateGreeting('Olá Ana,')).toBe('Olá {nome},');
    expect(templateGreeting('Bom dia, João Pedro!')).toBe('Bom dia, {nome}!');
    expect(templateGreeting('Prezado Sr. Carlos Lima,')).toBe('Prezado Sr. {nome},');
  });

  it('detecta a assinatura repetida', () => {
    expect(detectSignatureLines(sent)).toEqual(expect.arrayContaining(['Carlos Lima', 'Gerente Comercial']));
  });

  it('extrai saudações, despedidas, frases recorrentes e números do perfil', () => {
    const p = extractStyleProfile(sent, 123);
    expect(p.sampleCount).toBe(4);
    expect(p.greetings[0]).toEqual({ text: 'Olá {nome},', count: 3 });
    expect(p.closings[0]).toEqual({ text: 'Abraço,', count: 3 });
    expect(p.signatureLines).toEqual(expect.arrayContaining(['Carlos Lima']));
    expect(p.frequentPhrases.map((f) => f.text)).toContain('Fico à disposição para qualquer dúvida.');
    expect(p.avgWords).toBeGreaterThan(5);
    expect(p.updatedMs).toBe(123);
    expect(['informal', 'neutro', 'formal']).toContain(p.formalityLabel);
  });

  it('formalidade: "Prezado / Atenciosamente" = formal; "Oi / Abs / valeu" = informal', () => {
    const formal = extractStyleProfile(['Prezado Sr. Lima,\nInformamos o recebimento.\nAtenciosamente,\nCarlos'], 0);
    const informal = extractStyleProfile(['Oi Ana, tudo bem?\nValeu pelo retorno!\nAbs,\nCarlos'], 0);
    expect(formal.formalityLabel).toBe('formal');
    expect(informal.formalityLabel).toBe('informal');
  });

  it('anti-vazamento: frases com números, e-mails, links, valores ou nomes próprios não entram no perfil', () => {
    expect(isSafePhrase('Fico à disposição para qualquer dúvida.')).toBe(true);
    expect(isSafePhrase('O valor é R$ 1.500 por mês')).toBe(false);
    expect(isSafePhrase('Fale com ana@cliente.com sobre isso')).toBe(false);
    expect(isSafePhrase('Acesse https://x.com para ver')).toBe(false);
    expect(isSafePhrase('Combinei com a Mariana ontem cedo')).toBe(false);
    const leaky = ['Combinei com a Mariana ontem cedo.', 'Combinei com a Mariana ontem cedo.', 'Combinei com a Mariana ontem cedo.'];
    expect(extractStyleProfile(leaky, 0).frequentPhrases).toEqual([]);
  });
});

// ---------------------------------------------------------------- banco (em memória) e rotina

/** Cifra falsa para teste: inverte os bytes (prova que o texto não fica legível no banco). */
const fakeCipher: AstroCipher = {
  encode: (v) => ({ enc: 1, data: Uint8Array.from(Buffer.from(JSON.stringify(v), 'utf-8')).reverse() }),
  decode: (_enc, data) => JSON.parse(Buffer.from(Uint8Array.from(data).reverse()).toString('utf-8')),
};

describe('tabelas do Astro', () => {
  it('grava pares e perfil cifrados, lista decifrado e apaga por conta', () => {
    const db = new DatabaseSync(':memory:');
    const store = new AstroStore(db, fakeCipher);
    const meta = { inboundId: 'i1', outboundId: 'o1', threadKey: 'mid:a', inDateMs: 1, outDateMs: 2 };
    expect(store.insertPair('Eu@Empresa.com', meta, { question: 'Qual o horário?', answer: 'Das 9h às 18h.', subject: 'horário', counterpart: 'c@c.com' })).toBe(true);
    expect(store.insertPair('eu@empresa.com', meta, { question: 'x', answer: 'y', subject: 'z', counterpart: '' })).toBe(false);
    expect(store.countPairs('eu@empresa.com')).toBe(1);
    expect(store.listPairs('eu@empresa.com')[0]).toMatchObject({ question: 'Qual o horário?', answer: 'Das 9h às 18h.' });
    const raw = db.prepare('SELECT data FROM astro_knowledge_pairs').get() as any;
    expect(Buffer.from(raw.data).toString('utf-8')).not.toContain('horário');

    store.saveProfile('eu@empresa.com', extractStyleProfile(['Olá Ana,\nOk.\nAbraço,\nCarlos'], 5));
    expect(store.getProfile('EU@empresa.com')?.updatedMs).toBe(5);
    store.clearLearning('eu@empresa.com');
    expect(store.countPairs('eu@empresa.com')).toBe(0);
    expect(store.getProfile('eu@empresa.com')).toBeNull();
  });

  it('o banco garante no máximo 1 envio automático por conversa', () => {
    const db = new DatabaseSync(':memory:');
    new AstroStore(db, fakeCipher);
    const ins = db.prepare("INSERT INTO astro_auto_reply_log (account_email, thread_key, inbound_id, action, created_ms) VALUES ('a', 't', ?, ?, 1)");
    ins.run('i1', 'enviado');
    ins.run('i2', 'rascunho');
    expect(() => ins.run('i3', 'enviado')).toThrow();
  });

  it('rotina completa: pareia, limpa, grava e gera o perfil', async () => {
    const db = new DatabaseSync(':memory:');
    const store = new AstroStore(db, fakeCipher);
    const metas: PairableMeta[] = [
      inbound('in1', 'q1@c.com', { subject: 'Horário' }),
      outbound('out1', 'q1@c.com', { subject: 'Re: Horário' }),
      inbound('in2', 'q2@c.com', { senderEmail: 'newsletter@loja.com' }),
      outbound('out2', 'q2@c.com'),
    ];
    const bodies: Record<string, { body?: string; bodyHtml?: string }> = {
      in1: { body: 'Bom dia, qual o horário de atendimento?\n\nAtt,\nAna' },
      out1: { body: 'Olá Ana,\nAtendemos das 9h às 18h.\nAbraço,\nCarlos\n\nEm qui., Ana <a@c.com> escreveu:\n> Bom dia' },
      in2: { body: 'Ofertas' },
      out2: { body: 'Obrigado' },
    };
    const progress: LearningStatus[] = [];
    const final = await runLearning(
      'eu@empresa.com',
      ['eu@empresa.com'],
      { listMetas: () => metas, getBodies: (ids) => Object.fromEntries(ids.filter((i) => bodies[i]).map((i) => [i, bodies[i]])) },
      store,
      (s) => progress.push(s),
      new Date(Date.UTC(2026, 10, 27)).getTime()
    );
    expect(final).toMatchObject({ phase: 'concluido', running: false, pairsAdded: 1, pairsTotal: 1, styleSamples: 2 });
    const [pair] = store.listPairs('eu@empresa.com');
    expect(pair).toMatchObject({ inboundId: 'in1', answer: 'Atendemos das 9h às 18h.', subject: 'horário', counterpart: 'cliente@cliente.com' });
    expect(pair.question).toContain('qual o horário de atendimento?');
    expect(store.getProfile('eu@empresa.com')?.sampleCount).toBe(2);
    expect(progress.some((p) => p.phase === 'estilo')).toBe(true);

    // Rodar de novo não duplica
    const again = await runLearning('eu@empresa.com', [], { listMetas: () => metas, getBodies: (ids) => Object.fromEntries(ids.map((i) => [i, bodies[i]])) }, store, () => {});
    expect(again.pairsAdded).toBe(0);
    expect(store.countPairs('eu@empresa.com')).toBe(1);
  });
});
