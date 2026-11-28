import { describe, expect, it } from 'vitest';
import { extractSensitive, sanitizeAnswer } from './leakGuard';
import { categorizeEmail } from './categorize';
import { compareDraft } from './feedback';
import { decideReply, fillGreeting, firstNameOf, type EngineInput } from './replyEngine';
import { DEFAULT_ASTRO_REPLY_CONFIG, MIN_PAIRS_FOR_HISTORY } from './replyConfig';
import type { GuardContext } from './replyGuard';
import type { SimilarPair } from './patternSearch';
import type { StoredPair } from './types';
import { extractStyleProfile } from './styleProfile';

const NOW = new Date('2026-11-27T12:00:00Z').getTime();

// ------------------------------------------------------------------ anti-vazamento

describe('anti-vazamento', () => {
  it('reconhece dados sensíveis', () => {
    const items = extractSensitive(
      'Ana, o pedido 48213 de R$ 1.250,00 vence em 12/12. Fale com joao@cliente.com ou (11) 98888-7777. Veja https://x.com/p. CPF 123.456.789-09.'
    );
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['nome', 'numero', 'valor', 'data', 'email', 'telefone', 'url', 'documento']));
  });
  it('não trata horários, dias da semana e palavras comuns como sensíveis', () => {
    expect(extractSensitive('Atendemos de Segunda a Sexta, das 9h às 18h. Fico à disposição.')).toEqual([]);
  });
  it('remove só as frases com dados de outro cliente', () => {
    const r = sanitizeAnswer('Atendemos das 9h às 18h. O seu pedido 48213 já foi enviado para Mariana Lopes.', 'Qual o horário?');
    expect(r.text).toBe('Atendemos das 9h às 18h.');
    expect(r.removed.map((i) => i.value)).toEqual(expect.arrayContaining(['48213']));
    expect(r.leak).toBe(false);
  });
  it('mantém dados que estão no e-mail novo', () => {
    const r = sanitizeAnswer('Seu pedido 77001 foi enviado.', 'Qual o status do pedido 77001?');
    expect(r.text).toBe('Seu pedido 77001 foi enviado.');
    expect(r.removed).toEqual([]);
  });
  it('se sobra pouco do texto, marca vazamento', () => {
    const r = sanitizeAnswer('Ana, o boleto de R$ 980,00 vence em 10/12 e foi enviado para ana@cliente.com.', 'Pode mandar o boleto?');
    expect(r.leak).toBe(true);
  });
});

// ------------------------------------------------------------------ categoria e feedback

describe('categoria', () => {
  it.each([
    ['Segunda via', 'Preciso da segunda via do boleto', 'cobranca_pagamento'],
    ['Proposta', 'Gostaria de um orçamento para 10 licenças', 'comercial'],
    ['Reunião', 'Podemos marcar uma reunião na quinta?', 'agendamento'],
    ['Problema', 'O sistema está com erro e não consigo entrar', 'suporte'],
    ['Horário', 'Qual o horário de atendimento?', 'pedido_informacao'],
    ['', 'Obrigado pelo retorno!', 'agradecimento'],
    ['Oi', 'Segue o material conforme combinado', 'outro'],
  ])('%s → %s', (subject, text, cat) => {
    expect(categorizeEmail(subject, text)).toBe(cat);
  });
});

describe('aprendizado com as edições', () => {
  it('enviado igual = aprovado; muito alterado = não conta', () => {
    expect(compareDraft('Olá Ana, atendemos das 9h às 18h. Abraço', 'Olá Ana, atendemos das 9h às 18h. Abraço')).toMatchObject({
      similarity: 1,
      unchanged: true,
      approved: true,
    });
    const edited = compareDraft('Olá Ana, atendemos das 9h às 18h. Abraço', 'Olá Ana, nesta semana excepcionalmente fechamos às 16h por causa do feriado municipal. Abraço');
    expect(edited.approved).toBe(false);
    expect(edited.added).toEqual(expect.arrayContaining(['feriado']));
  });
});

// ------------------------------------------------------------------ motor

let id = 1;
const pair = (question: string, answer: string, subject = 'horário'): StoredPair => ({
  id: id++,
  inboundId: `in${id}`,
  outboundId: `out${id}`,
  threadKey: `mid:${id}`,
  category: null,
  inDateMs: 1,
  outDateMs: 2,
  uses: 0,
  subject,
  question,
  answer,
  counterpart: 'outro@cliente.com',
});
const sim = (p: StoredPair, similarity: number): SimilarPair => ({ pair: p, similarity });

const profile = extractStyleProfile(
  Array.from({ length: 12 }, (_, i) => `Olá ${['Ana', 'Bruno', 'Carla'][i % 3]},\nTudo certo por aqui.\nAbraço,\nCarlos Lima\nGerente`),
  NOW
);

const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({
  nowMs: NOW,
  config: { ...DEFAULT_ASTRO_REPLY_CONFIG, autonomy: 'rascunho', activatedAtMs: NOW - 86_400_000 },
  myAddresses: ['eu@empresa.com'],
  autoRepliesInThread: 0,
  autoRepliesToday: 0,
  approvedDrafts: 0,
  ...over,
});

const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  email: {
    id: 'novo-1',
    folder: 'inbox',
    sender: 'Joana Prado',
    senderEmail: 'joana@cliente2.com',
    recipient: 'eu@empresa.com',
    subject: 'Horário de atendimento',
    messageIdHeader: '<novo@cliente2.com>',
    receivedDateStr: new Date(NOW - 3_600_000).toISOString(),
  },
  text: 'Boa tarde, qual o horário de atendimento de vocês?',
  profile,
  similar: [
    sim(pair('Qual o horário de atendimento?', 'Atendemos de segunda a sexta, das 9h às 18h.'), 0.82),
    sim(pair('Até que horas vocês atendem?', 'Atendemos de segunda a sexta, das 9h às 18h.'), 0.6),
  ],
  pairCount: 40,
  ctx: ctx(),
  ...over,
});

describe('motor do Astro', () => {
  it('nome e saudação', () => {
    expect(firstNameOf('JOANA PRADO')).toBe('Joana');
    expect(firstNameOf('Equipe Financeiro')).toBe('');
    expect(firstNameOf('contato@x.com')).toBe('');
    expect(fillGreeting('Olá {nome},', 'Ana')).toBe('Olá Ana,');
    expect(fillGreeting('Olá {nome},', '')).toBe('Olá,');
    expect(fillGreeting('Bom dia, {nome}!', '')).toBe('Bom dia!');
    expect(fillGreeting('Prezado Sr. {nome},', '')).toBe('Prezado,');
  });

  it('caso simples e recorrente: rascunho no seu estilo, com a confiança e os pares usados', () => {
    const d = decideReply(input());
    expect(d).toMatchObject({
      versao: 1,
      email_id: 'novo-1',
      categoria: 'pedido_informacao',
      complexidade: 'simples',
      acao: 'salvar_rascunho',
      estilo_aplicado: true,
    });
    expect(d.score_confianca).toBeGreaterThanOrEqual(0.7);
    expect(d.pares_utilizados_ids).toHaveLength(2);
    expect(d.resposta_sugerida).toEqual({
      para: 'joana@cliente2.com',
      assunto: 'Re: Horário de atendimento',
      corpo: 'Olá Joana,\n\nAtendemos de segunda a sexta, das 9h às 18h.\n\nAbraço,',
    });
    expect(d.justificativa).toContain('Baseado em 2 e-mails parecidos');
  });

  it('cold start: menos de 20 conversas → só classifica, com o progresso na justificativa', () => {
    const d = decideReply(input({ pairCount: MIN_PAIRS_FOR_HISTORY - 8 }));
    expect(d.acao).toBe('apenas_classificar');
    expect(d.resposta_sugerida).toBeNull();
    expect(d.travas_acionadas).toContain('historico_insuficiente');
    expect(d.justificativa).toContain('12 de 20');
  });

  it('estilo ainda não aprendido: usa saudação e despedida neutras', () => {
    const d = decideReply(input({ profile: null }));
    expect(d.resposta_sugerida?.corpo).toBe('Olá Joana,\n\nAtendemos de segunda a sexta, das 9h às 18h.\n\nAtenciosamente,');
    expect(d.estilo_aplicado).toBe(false);
  });

  it('sem casos parecidos → precisa de você (sem rascunho)', () => {
    const d = decideReply(input({ similar: [] }));
    expect(d.acao).toBe('escalar_humano');
    expect(d.resposta_sugerida).toBeNull();
    expect(d.travas_acionadas).toContain('sem_padrao');
  });

  it('anti-vazamento: tira dados do outro cliente e baixa a confiança', () => {
    const d = decideReply(
      input({
        similar: [sim(pair('Qual o horário?', 'Atendemos das 9h às 18h. O pedido 48213 da Mariana Lopes já saiu.'), 0.8)],
      })
    );
    expect(d.resposta_sugerida?.corpo).not.toMatch(/48213|Mariana/);
    expect(d.dados_removidos.length).toBeGreaterThan(0);
    expect(d.complexidade).toBe('pensada');
  });

  it('anti-vazamento: se a resposta antiga é quase toda de outro cliente → revisão humana', () => {
    const d = decideReply(
      input({ similar: [sim(pair('Pode mandar o boleto?', 'Ana, o boleto de R$ 980,00 vence em 10/12 e foi para ana@cliente.com.'), 0.9)] })
    );
    expect(d.acao).toBe('escalar_humano');
    expect(d.travas_acionadas).toContain('vazamento');
    expect(d.resposta_sugerida).toBeNull();
  });

  it('newsletter: só classifica como automático, sem rascunho', () => {
    const base = input();
    const d = decideReply({ ...base, email: { ...base.email, senderEmail: 'newsletter@loja.com', listUnsubscribe: '<https://x>' } });
    expect(d).toMatchObject({ categoria: 'automatico', acao: 'apenas_classificar', resposta_sugerida: null, pares_utilizados_ids: [] });
  });

  it('anexo: rascunho com aviso, mesmo com confiança alta', () => {
    const base = input();
    const d = decideReply({ ...base, email: { ...base.email, attachments: [{ name: 'contrato.pdf' }] } });
    expect(d.acao).toBe('salvar_rascunho');
    expect(d.travas_acionadas).toContain('anexo');
    expect(d.justificativa).toContain('tem anexo para conferir');
  });

  it('envio automático: só com autonomia automática E 20 rascunhos aprovados', () => {
    const auto = { ...DEFAULT_ASTRO_REPLY_CONFIG, autonomy: 'automatico' as const, activatedAtMs: NOW - 86_400_000 };
    expect(decideReply(input({ ctx: ctx({ config: auto, approvedDrafts: 5 }) })).acao).toBe('salvar_rascunho');
    expect(decideReply(input({ ctx: ctx({ config: auto, approvedDrafts: 20 }) })).acao).toBe('enviar_automatico');
  });

  it('cobrança/comercial/suporte: sempre resposta pensada (nunca automática)', () => {
    const auto = { ...DEFAULT_ASTRO_REPLY_CONFIG, autonomy: 'automatico' as const, activatedAtMs: NOW - 86_400_000 };
    const base = input({ ctx: ctx({ config: auto, approvedDrafts: 50 }) });
    const d = decideReply({ ...base, text: 'Pode me mandar a segunda via do boleto?', email: { ...base.email, subject: 'Boleto' } });
    expect(d.complexidade).toBe('pensada');
    expect(d.acao).not.toBe('enviar_automatico');
  });

  it('"Apenas classificar": nunca entrega rascunho', () => {
    const d = decideReply(input({ ctx: ctx({ config: { ...DEFAULT_ASTRO_REPLY_CONFIG, autonomy: 'classificar', activatedAtMs: 0 } }) }));
    expect(d.acao).toBe('apenas_classificar');
    expect(d.resposta_sugerida).toBeNull();
  });
});
