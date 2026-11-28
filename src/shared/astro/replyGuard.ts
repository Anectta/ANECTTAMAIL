/**
 * Astro Respostas Inteligentes — travas de segurança determinísticas.
 *
 * Regras fixas no código, aplicadas ANTES de qualquer sugestão do Astro e DE NOVO imediatamente
 * antes de um envio automático. Cada trava só pode REBAIXAR a ação; nenhuma regra eleva.
 *
 * Ordem das ações (da mais "forte" para a mais "fraca"):
 *   enviar_automatico > salvar_rascunho > escalar_humano > apenas_classificar
 */
import { AstroReplyConfig, MAX_AUTO_REPLIES_PER_THREAD, MIN_APPROVED_DRAFTS_FOR_AUTO } from './replyConfig';

export type AstroAction = 'enviar_automatico' | 'salvar_rascunho' | 'escalar_humano' | 'apenas_classificar';

export type AstroTrigger =
  | 'desligado'
  | 'pausado'
  | 'autonomia'
  | 'no_reply'
  | 'marketing'
  | 'mensagem_automatica'
  | 'remetente_proprio'
  | 'remetente_bloqueado'
  | 'golpe'
  | 'fora_da_entrada'
  | 'anexo'
  | 'grupo_cc'
  | 'anti_loop'
  | 'temporal'
  | 'reply_to_suspeito'
  | 'complexidade'
  | 'confianca_baixa'
  | 'limite_diario'
  | 'vazamento'
  | 'sem_padrao'
  | 'historico_insuficiente'
  | 'aprovacoes_insuficientes';

/** Dados do e-mail recebido usados pelas travas (subconjunto do EmailItem). */
export interface GuardEmail {
  id: string;
  folder?: string;
  senderEmail?: string;
  /** Campo "Para" como texto (pode ter vários endereços). */
  recipient?: string;
  cc?: string;
  subject?: string;
  hasAttachment?: boolean;
  attachments?: Array<{ name?: string; isSignature?: boolean; isInline?: boolean }>;
  listUnsubscribe?: string;
  listId?: string;
  precedence?: string;
  autoSubmitted?: string;
  autoResponseSuppress?: string;
  messageIdHeader?: string;
  inReplyToHeader?: string;
  referencesHeader?: string[];
  /** Data de recebimento (ISO). Usa receivedDateStr e, na falta, dateStr. */
  receivedDateStr?: string;
  dateStr?: string;
}

/** Situação do momento, montada por quem chama (motor do Astro / envio SMTP). */
export interface GuardContext {
  nowMs: number;
  config: AstroReplyConfig;
  /** Endereços de todas as contas do usuário (nunca responder a si mesmo). */
  myAddresses: string[];
  /** O remetente está na lista de bloqueados? */
  senderBlocked?: boolean;
  /** O Escudo considera o e-mail um possível golpe? */
  phishingDanger?: boolean;
  /** O "Responder para" é suspeito (replyToRisk = warn)? */
  replyToSuspicious?: boolean;
  /** Quantas respostas automáticas já foram enviadas nesta conversa. */
  autoRepliesInThread: number;
  /** Quantas respostas automáticas já foram enviadas hoje nesta conta. */
  autoRepliesToday: number;
  /** Rascunhos do Astro que o usuário aprovou (enviou com poucas mudanças) nesta conta. */
  approvedDrafts?: number;
}

/** O que o motor do Astro pretende fazer (antes das travas). */
export interface GuardProposal {
  action: AstroAction;
  complexity: 'simples' | 'pensada';
  /** Confiança do motor, de 0 a 1. */
  confidence: number;
  /** O anti-vazamento encontrou dados de outros clientes que não conseguiu remover. */
  leakDetected?: boolean;
  /** Não há pares históricos parecidos o bastante. */
  noPattern?: boolean;
}

export interface GuardResult {
  action: AstroAction;
  triggers: AstroTrigger[];
  /** true quando o e-mail é automático/promocional: só classificar, sem rascunho. */
  classifyOnly: boolean;
}

const RANK: Record<AstroAction, number> = {
  apenas_classificar: 0,
  escalar_humano: 1,
  salvar_rascunho: 2,
  enviar_automatico: 3,
};

const lower = (a: AstroAction, b: AstroAction): AstroAction => (RANK[a] <= RANK[b] ? a : b);

/** Extrai os endereços de e-mail de um campo como "Ana <ana@x.com>, bob@y.com". */
export function extractAddresses(field: string | undefined): string[] {
  if (!field) return [];
  const found = field.match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  return Array.from(new Set(found.map((a) => a.toLowerCase())));
}

const SENDER_LOCAL_PATTERNS: Array<{ re: RegExp; trigger: AstroTrigger }> = [
  { re: /(^|[._+-])(no[-_.]?reply|do[-_.]?not[-_.]?reply|nao[-_.]?responda|nao[-_.]?responder)([._+-]|$)/, trigger: 'no_reply' },
  { re: /(^|[._+-])(mailer[-_.]?daemon|postmaster|bounces?)([._+-]|$)/, trigger: 'no_reply' },
  { re: /(^|[._+-])(newsletters?|marketing|promo|promos|promocao|promocoes|promotions?|notifications?|notificacoes?)([._+-]|$)/, trigger: 'marketing' },
];

/** Gatilhos do remetente (endereço): no-reply, marketing, notificações. */
export function senderAutomationTriggers(senderEmail: string | undefined): AstroTrigger[] {
  const addr = (senderEmail || '').trim().toLowerCase();
  const local = addr.split('@')[0] || '';
  if (!local) return [];
  const out = new Set<AstroTrigger>();
  for (const p of SENDER_LOCAL_PATTERNS) if (p.re.test(local)) out.add(p.trigger);
  return Array.from(out);
}

/** Gatilhos dos cabeçalhos MIME de disparo em massa / automação. */
export function headerAutomationTriggers(email: GuardEmail): AstroTrigger[] {
  const out = new Set<AstroTrigger>();
  if ((email.listUnsubscribe || '').trim() || (email.listId || '').trim()) out.add('marketing');
  if (/\b(bulk|list|junk)\b/i.test(email.precedence || '')) out.add('marketing');
  const autoSubmitted = (email.autoSubmitted || '').trim().toLowerCase();
  if (autoSubmitted && !/^no\b/.test(autoSubmitted)) out.add('mensagem_automatica');
  if ((email.autoResponseSuppress || '').trim()) out.add('mensagem_automatica');
  return Array.from(out);
}

/** O e-mail tem anexo de verdade (ignora imagens de assinatura e imagens embutidas)? */
export function hasRealAttachment(email: GuardEmail): boolean {
  const list = email.attachments || [];
  if (list.some((a) => !a.isSignature && !a.isInline)) return true;
  // Sem lista detalhada, confia no indicador do servidor
  return list.length === 0 && email.hasAttachment === true;
}

/** Conversa em grupo: tem CC ou mais de um destinatário em "Para". */
export function isGroupConversation(email: GuardEmail): boolean {
  return extractAddresses(email.cc).length > 0 || extractAddresses(email.recipient).length > 1;
}

const cleanMsgId = (v: string | undefined) => (v || '').trim().replace(/^<|>$/g, '').toLowerCase();

/** Assunto sem "Re:", "Fwd:", "Enc:", "RES:" etc. */
export function normalizeSubject(subject: string | undefined): string {
  let s = (subject || '').trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^\s*(re|res|fw|fwd|enc|tr|aw|wg)\s*(\[\d+\])?\s*:\s*/i, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Identifica a conversa: 1º ID do References (raiz), senão In-Reply-To, senão o próprio Message-ID.
 * Último recurso: assunto normalizado + remetente.
 */
export function computeThreadKey(email: GuardEmail): string {
  const root = cleanMsgId((email.referencesHeader || [])[0]);
  if (root) return `mid:${root}`;
  const parent = cleanMsgId(email.inReplyToHeader);
  if (parent) return `mid:${parent}`;
  const own = cleanMsgId(email.messageIdHeader);
  if (own) return `mid:${own}`;
  return `subj:${normalizeSubject(email.subject)}|${(email.senderEmail || '').trim().toLowerCase()}`;
}

/** Data de recebimento em ms (NaN quando inválida). */
export function receivedAtMs(email: GuardEmail): number {
  for (const v of [email.receivedDateStr, email.dateStr]) {
    if (v) {
      const t = new Date(v).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  return Number.NaN;
}

/**
 * Pré-filtro de entrada: mensagens automáticas/promocionais e casos que nunca devem receber
 * rascunho nem resposta (só classificação). Roda antes de qualquer processamento do Astro.
 */
export function inboundPreFilter(email: GuardEmail, ctx: Pick<GuardContext, 'myAddresses' | 'senderBlocked' | 'phishingDanger'>): AstroTrigger[] {
  const out = new Set<AstroTrigger>([...senderAutomationTriggers(email.senderEmail), ...headerAutomationTriggers(email)]);
  const sender = (email.senderEmail || '').trim().toLowerCase();
  if (sender && ctx.myAddresses.some((a) => a.trim().toLowerCase() === sender)) out.add('remetente_proprio');
  if (ctx.senderBlocked) out.add('remetente_bloqueado');
  if (ctx.phishingDanger) out.add('golpe');
  const folder = (email.folder || 'inbox').toLowerCase();
  if (folder !== 'inbox') out.add('fora_da_entrada');
  return Array.from(out);
}

/**
 * Aplica todas as travas sobre a proposta do motor e devolve a ação final.
 * Usada antes de gerar sugestões e, de novo, imediatamente antes de um envio automático.
 */
export function applyGuards(email: GuardEmail, ctx: GuardContext, proposal: GuardProposal): GuardResult {
  const triggers: AstroTrigger[] = [];
  const add = (t: AstroTrigger) => {
    if (!triggers.includes(t)) triggers.push(t);
  };
  let action: AstroAction = proposal.action;

  // 1) Opção desligada nesta conta
  if (ctx.config.autonomy === 'desligado') {
    return { action: 'apenas_classificar', triggers: ['desligado'], classifyOnly: true };
  }

  // 2) Pré-filtro: automáticos, promocionais, a si mesmo, bloqueados, golpe, fora da Caixa de Entrada
  const pre = inboundPreFilter(email, ctx);
  if (pre.length > 0) {
    return { action: 'apenas_classificar', triggers: pre, classifyOnly: true };
  }

  // 3) Nível de autonomia escolhido pelo usuário
  if (ctx.config.autonomy === 'classificar') {
    action = lower(action, 'apenas_classificar');
    add('autonomia');
  } else if (ctx.config.autonomy === 'rascunho') {
    if (RANK[action] > RANK.salvar_rascunho) add('autonomia');
    action = lower(action, 'salvar_rascunho');
  }

  // 4) Anti-vazamento sem correção possível / sem padrão histórico → revisão humana
  if (proposal.leakDetected) {
    add('vazamento');
    action = lower(action, 'escalar_humano');
  }
  if (proposal.noPattern) {
    add('sem_padrao');
    action = lower(action, 'salvar_rascunho');
  }

  // 5) Travas que impedem o envio automático (no máximo rascunho)
  const capToDraft = (t: AstroTrigger) => {
    add(t);
    action = lower(action, 'salvar_rascunho');
  };
  if (hasRealAttachment(email)) capToDraft('anexo');
  if (isGroupConversation(email)) capToDraft('grupo_cc');
  if (ctx.autoRepliesInThread >= MAX_AUTO_REPLIES_PER_THREAD) capToDraft('anti_loop');

  const received = receivedAtMs(email);
  const maxAgeMs = ctx.config.maxAgeHours * 3_600_000;
  if (
    Number.isNaN(received) ||
    received < ctx.config.activatedAtMs ||
    ctx.nowMs - received > maxAgeMs ||
    received - ctx.nowMs > 15 * 60_000 // data no futuro (relógio errado / e-mail forjado)
  ) {
    capToDraft('temporal');
  }

  if (ctx.replyToSuspicious) capToDraft('reply_to_suspeito');
  if (proposal.complexity === 'pensada') capToDraft('complexidade');
  if (!(proposal.confidence >= ctx.config.minConfidence)) capToDraft('confianca_baixa');
  if (ctx.autoRepliesToday >= ctx.config.maxAutoPerDay) capToDraft('limite_diario');
  if (ctx.config.paused) capToDraft('pausado');
  // "Modo sombra": envio automático só depois de N rascunhos aprovados pelo usuário
  if (ctx.config.autonomy === 'automatico' && (ctx.approvedDrafts ?? 0) < MIN_APPROVED_DRAFTS_FOR_AUTO) {
    capToDraft('aprovacoes_insuficientes');
  }

  return { action, triggers, classifyOnly: false };
}
