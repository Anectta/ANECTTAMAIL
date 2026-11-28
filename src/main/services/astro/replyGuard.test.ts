import { describe, expect, it } from 'vitest';
import { normalizeAstroReplyConfig, DEFAULT_ASTRO_REPLY_CONFIG, type AstroReplyConfig } from './replyConfig';
import {
  applyGuards,
  computeThreadKey,
  extractAddresses,
  headerAutomationTriggers,
  inboundPreFilter,
  normalizeSubject,
  senderAutomationTriggers,
  type GuardContext,
  type GuardEmail,
  type GuardProposal,
} from './replyGuard';

const NOW = new Date('2026-11-27T12:00:00Z').getTime();
const HOUR = 3_600_000;

const config = (over: Partial<AstroReplyConfig> = {}): AstroReplyConfig => ({
  ...DEFAULT_ASTRO_REPLY_CONFIG,
  autonomy: 'automatico',
  activatedAtMs: NOW - 10 * 24 * HOUR,
  ...over,
});

const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({
  nowMs: NOW,
  config: config(),
  myAddresses: ['eu@empresa.com.br', 'vendas@empresa.com.br'],
  autoRepliesInThread: 0,
  autoRepliesToday: 0,
  ...over,
});

/** E-mail "limpo": um cliente escrevendo só para mim, há 1 hora, sem anexo. */
const email = (over: Partial<GuardEmail> = {}): GuardEmail => ({
  id: 'imap-INBOX-1',
  folder: 'inbox',
  senderEmail: 'cliente@cliente.com.br',
  recipient: 'Eu <eu@empresa.com.br>',
  subject: 'Horário de atendimento',
  messageIdHeader: '<abc@cliente.com.br>',
  receivedDateStr: new Date(NOW - HOUR).toISOString(),
  ...over,
});

const good: GuardProposal = { action: 'enviar_automatico', complexity: 'simples', confidence: 0.9 };

describe('configuração padrão', () => {
  it('valores aprovados: 70%, 30 por dia, 48 horas, desligado', () => {
    expect(DEFAULT_ASTRO_REPLY_CONFIG).toMatchObject({ minConfidence: 0.7, maxAutoPerDay: 30, maxAgeHours: 48, autonomy: 'desligado' });
  });
  it('valores inválidos voltam ao padrão', () => {
    const c = normalizeAstroReplyConfig({ minConfidence: 5, maxAutoPerDay: -1, maxAgeHours: 0, autonomy: 'x' as never }, NOW);
    expect(c).toMatchObject({ minConfidence: 0.7, maxAutoPerDay: 30, maxAgeHours: 48, autonomy: 'desligado', activatedAtMs: NOW });
  });
});

describe('caminho livre', () => {
  it('e-mail limpo com proposta boa pode ser enviado automaticamente', () => {
    const r = applyGuards(email(), ctx(), good);
    expect(r).toEqual({ action: 'enviar_automatico', triggers: [], classifyOnly: false });
  });
});

describe('pré-filtro: no-reply, marketing e mensagens automáticas', () => {
  it.each([
    'no-reply@banco.com',
    'noreply@loja.com',
    'no_reply@x.com',
    'do-not-reply@x.com',
    'nao-responda@gov.br',
    'naoresponda@empresa.com',
    'MAILER-DAEMON@mx.com',
  ])('%s → só classificar', (sender) => {
    expect(senderAutomationTriggers(sender)).toContain('no_reply');
    const r = applyGuards(email({ senderEmail: sender }), ctx(), good);
    expect(r.action).toBe('apenas_classificar');
    expect(r.classifyOnly).toBe(true);
  });

  it.each(['newsletter@loja.com', 'marketing@x.com', 'promo@x.com', 'notifications@github.com', 'ofertas.promo@x.com'])(
    '%s → marketing',
    (sender) => {
      expect(senderAutomationTriggers(sender)).toContain('marketing');
    }
  );

  it('não confunde nomes comuns', () => {
    expect(senderAutomationTriggers('promotora.ana@x.com')).toEqual([]);
    expect(senderAutomationTriggers('joao.noreira@x.com')).toEqual([]);
    expect(senderAutomationTriggers('cliente@cliente.com.br')).toEqual([]);
  });

  it('cabeçalhos de disparo em massa e automação', () => {
    expect(headerAutomationTriggers(email({ listUnsubscribe: '<https://x.com/sair>' }))).toContain('marketing');
    expect(headerAutomationTriggers(email({ listId: '<lista.x.com>' }))).toContain('marketing');
    expect(headerAutomationTriggers(email({ precedence: 'bulk' }))).toContain('marketing');
    expect(headerAutomationTriggers(email({ precedence: 'list' }))).toContain('marketing');
    expect(headerAutomationTriggers(email({ autoSubmitted: 'auto-generated' }))).toContain('mensagem_automatica');
    expect(headerAutomationTriggers(email({ autoSubmitted: 'auto-replied' }))).toContain('mensagem_automatica');
    expect(headerAutomationTriggers(email({ autoResponseSuppress: 'All' }))).toContain('mensagem_automatica');
    expect(headerAutomationTriggers(email({ autoSubmitted: 'no' }))).toEqual([]);
    const r = applyGuards(email({ listUnsubscribe: '<mailto:sair@x.com>' }), ctx(), good);
    expect(r).toMatchObject({ action: 'apenas_classificar', classifyOnly: true });
  });

  it('nunca responde a si mesmo, a bloqueados, a golpes nem fora da Caixa de Entrada', () => {
    expect(inboundPreFilter(email({ senderEmail: 'Vendas@Empresa.com.br' }), ctx())).toContain('remetente_proprio');
    expect(inboundPreFilter(email(), ctx({ senderBlocked: true }))).toContain('remetente_bloqueado');
    expect(inboundPreFilter(email(), ctx({ phishingDanger: true }))).toContain('golpe');
    expect(inboundPreFilter(email({ folder: 'junk' }), ctx())).toContain('fora_da_entrada');
    expect(applyGuards(email({ folder: 'sent' }), ctx(), good).action).toBe('apenas_classificar');
  });
});

describe('anexos', () => {
  it('anexo real força rascunho, mesmo com confiança alta', () => {
    const r = applyGuards(email({ attachments: [{ name: 'contrato.pdf' }] }), ctx(), { ...good, confidence: 0.99 });
    expect(r.action).toBe('salvar_rascunho');
    expect(r.triggers).toContain('anexo');
  });
  it('indicador do servidor sem lista detalhada também conta', () => {
    expect(applyGuards(email({ hasAttachment: true }), ctx(), good).triggers).toContain('anexo');
  });
  it('imagens de assinatura ou embutidas não contam como anexo', () => {
    const r = applyGuards(email({ hasAttachment: true, attachments: [{ name: 'logo.png', isSignature: true }, { name: 'img.png', isInline: true }] }), ctx(), good);
    expect(r.triggers).not.toContain('anexo');
  });
});

describe('conversas em grupo', () => {
  it('CC força rascunho', () => {
    const r = applyGuards(email({ cc: 'Gerente <gerente@cliente.com.br>' }), ctx(), good);
    expect(r).toMatchObject({ action: 'salvar_rascunho' });
    expect(r.triggers).toContain('grupo_cc');
  });
  it('mais de um destinatário em "Para" força rascunho', () => {
    const r = applyGuards(email({ recipient: 'eu@empresa.com.br, colega@empresa.com.br' }), ctx(), good);
    expect(r.triggers).toContain('grupo_cc');
  });
  it('extrai endereços de campos com nomes', () => {
    expect(extractAddresses('"Silva, Ana" <Ana@X.com>, bob@y.com.br; ana@x.com')).toEqual(['ana@x.com', 'bob@y.com.br']);
  });
});

describe('anti-loop por conversa', () => {
  it('a partir da 1ª resposta automática na conversa, só rascunho', () => {
    expect(applyGuards(email(), ctx({ autoRepliesInThread: 0 }), good).action).toBe('enviar_automatico');
    const r = applyGuards(email(), ctx({ autoRepliesInThread: 1 }), good);
    expect(r.action).toBe('salvar_rascunho');
    expect(r.triggers).toContain('anti_loop');
  });
  it('chave da conversa: raiz do References, depois In-Reply-To, depois Message-ID', () => {
    expect(computeThreadKey(email({ referencesHeader: ['<Raiz@x.com>', '<b@x.com>'], inReplyToHeader: '<b@x.com>' }))).toBe('mid:raiz@x.com');
    expect(computeThreadKey(email({ inReplyToHeader: '<Pai@x.com>' }))).toBe('mid:pai@x.com');
    expect(computeThreadKey(email())).toBe('mid:abc@cliente.com.br');
    expect(computeThreadKey(email({ messageIdHeader: undefined, subject: 'RE: Fwd: Horário' }))).toBe('subj:horário|cliente@cliente.com.br');
  });
  it('assunto sem prefixos de resposta/encaminhamento', () => {
    expect(normalizeSubject('Re: RES: ENC: Proposta')).toBe('proposta');
    expect(normalizeSubject('Fwd[2]: Proposta  nova')).toBe('proposta nova');
  });
});

describe('trava temporal (anti-avalanche)', () => {
  it('e-mail com mais de 48 horas → rascunho', () => {
    const r = applyGuards(email({ receivedDateStr: new Date(NOW - 49 * HOUR).toISOString() }), ctx(), good);
    expect(r.triggers).toContain('temporal');
    expect(r.action).toBe('salvar_rascunho');
  });
  it('e-mail recebido antes da ativação (sincronização inicial / importação .pst) → rascunho', () => {
    const c = ctx({ config: config({ activatedAtMs: NOW - 30 * 60_000 }) });
    expect(applyGuards(email({ receivedDateStr: new Date(NOW - HOUR).toISOString() }), c, good).triggers).toContain('temporal');
  });
  it('data inválida ou no futuro → rascunho', () => {
    expect(applyGuards(email({ receivedDateStr: 'x', dateStr: undefined }), ctx(), good).triggers).toContain('temporal');
    expect(applyGuards(email({ receivedDateStr: new Date(NOW + 2 * HOUR).toISOString() }), ctx(), good).triggers).toContain('temporal');
  });
});

describe('autonomia, confiança e limites', () => {
  it('desligado → nada além de classificar', () => {
    const r = applyGuards(email(), ctx({ config: config({ autonomy: 'desligado' }) }), good);
    expect(r).toEqual({ action: 'apenas_classificar', triggers: ['desligado'], classifyOnly: true });
  });
  it('"Apenas classificar" e "Sugerir rascunho" limitam a ação', () => {
    expect(applyGuards(email(), ctx({ config: config({ autonomy: 'classificar' }) }), good).action).toBe('apenas_classificar');
    const r = applyGuards(email(), ctx({ config: config({ autonomy: 'rascunho' }) }), good);
    expect(r.action).toBe('salvar_rascunho');
    expect(r.triggers).toContain('autonomia');
  });
  it('confiança abaixo de 70% → rascunho; exatamente 70% passa', () => {
    expect(applyGuards(email(), ctx(), { ...good, confidence: 0.69 }).triggers).toContain('confianca_baixa');
    expect(applyGuards(email(), ctx(), { ...good, confidence: 0.7 }).action).toBe('enviar_automatico');
    expect(applyGuards(email(), ctx(), { ...good, confidence: Number.NaN }).triggers).toContain('confianca_baixa');
  });
  it('resposta "pensada" → rascunho', () => {
    expect(applyGuards(email(), ctx(), { ...good, complexity: 'pensada' }).triggers).toContain('complexidade');
  });
  it('limite de 30 envios por dia e pausa manual', () => {
    expect(applyGuards(email(), ctx({ autoRepliesToday: 29 }), good).action).toBe('enviar_automatico');
    expect(applyGuards(email(), ctx({ autoRepliesToday: 30 }), good).triggers).toContain('limite_diario');
    expect(applyGuards(email(), ctx({ config: config({ paused: true }) }), good).triggers).toContain('pausado');
  });
  it('"Responder para" suspeito → rascunho', () => {
    expect(applyGuards(email(), ctx({ replyToSuspicious: true }), good).triggers).toContain('reply_to_suspeito');
  });
  it('vazamento não corrigido → revisão humana; sem padrão → rascunho', () => {
    expect(applyGuards(email(), ctx(), { ...good, leakDetected: true }).action).toBe('escalar_humano');
    expect(applyGuards(email(), ctx(), { ...good, noPattern: true }).action).toBe('salvar_rascunho');
  });
  it('travas só rebaixam: várias juntas aparecem todas e a ação é a mais restritiva', () => {
    const r = applyGuards(
      email({ cc: 'x@y.com', attachments: [{ name: 'a.pdf' }] }),
      ctx({ autoRepliesInThread: 1 }),
      { ...good, leakDetected: true }
    );
    expect(r.action).toBe('escalar_humano');
    expect(r.triggers).toEqual(expect.arrayContaining(['vazamento', 'anexo', 'grupo_cc', 'anti_loop']));
  });
  it('proposta já fraca nunca é elevada', () => {
    expect(applyGuards(email(), ctx(), { ...good, action: 'apenas_classificar' }).action).toBe('apenas_classificar');
  });
});
