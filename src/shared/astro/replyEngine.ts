/**
 * Astro Respostas Inteligentes — motor de decisão (modo Local, sem IA).
 *
 * Junta: [perfil de estilo] + [casos parecidos do histórico] + [e-mail novo] e devolve a decisão
 * estruturada (JSON). O rascunho é a resposta antiga mais parecida, limpa pelo anti-vazamento,
 * com a sua saudação e a sua despedida. Depois, as travas fixas só podem REBAIXAR a ação.
 */
import { categorizeEmail, type AstroCategory } from './categorize';
import { sanitizeAnswer, type SensitiveItem } from './leakGuard';
import { cosineSimilarity, tokenize, type SimilarPair } from './patternSearch';
import { MIN_PAIRS_FOR_HISTORY, MIN_STYLE_SAMPLES, type AstroReplyConfig } from './replyConfig';
import { TRIGGER_LABELS } from './labels';
import {
  applyGuards,
  computeThreadKey,
  type AstroAction,
  type AstroTrigger,
  type GuardContext,
  type GuardEmail,
  type GuardProposal,
} from './replyGuard';
import type { StyleProfile } from './styleProfile';

export interface AstroSuggestedReply {
  para: string;
  assunto: string;
  corpo: string;
}

/** Contrato JSON da decisão do Astro. */
export interface AstroDecision {
  versao: 1;
  email_id: string;
  thread_key: string;
  categoria: AstroCategory;
  complexidade: 'simples' | 'pensada';
  /** 0 a 1. */
  score_confianca: number;
  acao: AstroAction;
  travas_acionadas: AstroTrigger[];
  justificativa: string;
  pares_utilizados_ids: number[];
  resposta_sugerida: AstroSuggestedReply | null;
  /** Transparência: dados de outros clientes que o anti-vazamento tirou do rascunho. */
  dados_removidos: SensitiveItem[];
  /** O rascunho usou o seu estilo aprendido (saudação/despedida)? */
  estilo_aplicado: boolean;
}

export interface EngineEmail extends GuardEmail {
  /** Nome de quem enviou ("Ana Souza"). */
  sender?: string;
  /** Endereço de "Responder para", quando houver. */
  replyTo?: string;
}

export interface EngineInput {
  email: EngineEmail;
  /** Texto limpo do e-mail novo (sem citação/assinatura). */
  text: string;
  profile: StyleProfile | null;
  /** Casos parecidos (do buscador), do mais ao menos semelhante. */
  similar: SimilarPair[];
  /** Quantos pares a conta tem no histórico. */
  pairCount: number;
  ctx: GuardContext;
  /** Dados do próprio usuário que podem aparecer na resposta (nome, assinatura). */
  ownContext?: string;
}

export { TRIGGER_LABELS };

const AUTOMATION: AstroTrigger[] = ['no_reply', 'marketing', 'mensagem_automatica'];
/** Categorias que envolvem dinheiro, contrato ou problema: sempre resposta pensada. */
const ALWAYS_THOUGHTFUL: AstroCategory[] = ['comercial', 'cobranca_pagamento', 'suporte'];
const DEFAULT_GREETING = 'Olá {nome},';
const DEFAULT_CLOSING = 'Atenciosamente,';

const wordCount = (t: string) => (t || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const round2 = (n: number) => Math.round(Math.max(0, Math.min(0.99, n)) * 100) / 100;

/** Primeiro nome de quem enviou, quando parece uma pessoa ("ANA SOUZA" → "Ana"). */
export function firstNameOf(sender: string | undefined): string {
  const s = (sender || '').replace(/["'<>]/g, '').trim();
  if (!s || /@|\d/.test(s)) return '';
  if (/\b(ltda|s\.?a\.?|inc|me|eireli|equipe|time|suporte|atendimento|financeiro|comercial|contato|vendas|sac|noreply|no-reply|loja|empresa)\b/i.test(s)) {
    return '';
  }
  const first = s.split(/[\s,]+/)[0];
  if (!/^[\p{L}'-]{2,}$/u.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** "Olá {nome}," + nome → "Olá Ana,"; sem nome → "Olá,". */
export function fillGreeting(template: string, name: string): string {
  if (name) return template.replace('{nome}', name);
  return template
    .replace(/,?\s*\{nome\}/, '')
    .replace(/\s+(Sr|Sra|Dr|Dra|Srs|Sras)\.?(?=[,!.:]|$)/i, '')
    .replace(/\s+([,!.:])/g, '$1')
    .trim();
}

export function composeReply(
  email: EngineEmail,
  body: string,
  profile: StyleProfile | null,
  styleReady: boolean,
  config?: Pick<AstroReplyConfig, 'greetingOverride' | 'closingOverride'>
): AstroSuggestedReply {
  // Ordem: ajuste manual do usuário → estilo aprendido → padrão neutro
  const greetingTpl = config?.greetingOverride || (styleReady && profile?.greetings[0]?.text) || DEFAULT_GREETING;
  const closing = config?.closingOverride || (styleReady && profile?.closings[0]?.text) || DEFAULT_CLOSING;
  const greeting = fillGreeting(greetingTpl, firstNameOf(email.sender));
  const subject = (email.subject || '').trim();
  return {
    para: (email.replyTo || email.senderEmail || '').trim(),
    assunto: /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`.trim(),
    corpo: `${greeting}\n\n${body.trim()}\n\n${closing}`,
  };
}

function buildJustification(
  triggers: AstroTrigger[],
  usedCount: number,
  bestSimilarity: number,
  pairCount: number,
  removed: number,
  classifyOnly: boolean
): string {
  const parts: string[] = [];
  if (classifyOnly) {
    parts.push('O Astro só classifica este e-mail, sem rascunho.');
  } else if (triggers.includes('historico_insuficiente')) {
    parts.push(`Aprendendo o seu histórico: ${Math.min(pairCount, MIN_PAIRS_FOR_HISTORY)} de ${MIN_PAIRS_FOR_HISTORY} conversas analisadas.`);
  } else if (usedCount > 0) {
    parts.push(
      `Baseado em ${usedCount} ${usedCount === 1 ? 'e-mail parecido' : 'e-mails parecidos'} que você já respondeu (semelhança de ${Math.round(bestSimilarity * 100)}%).`
    );
  } else {
    parts.push('Não há casos parecidos no seu histórico: este e-mail precisa da sua resposta.');
  }
  if (removed > 0) parts.push(`${removed} ${removed === 1 ? 'dado de outro cliente foi removido' : 'dados de outros clientes foram removidos'} do rascunho.`);
  // "autonomia" é só a escolha do usuário (ex.: "Sugerir rascunho"): não precisa aparecer como trava
  const shown = triggers.filter((t) => t !== 'historico_insuficiente' && t !== 'sem_padrao' && t !== 'autonomia');
  if (shown.length > 0) parts.push(`Travas: ${shown.map((t) => TRIGGER_LABELS[t]).join('; ')}.`);
  return parts.join(' ');
}

/** Decide o que o Astro faz com um e-mail recebido. */
export function decideReply(input: EngineInput): AstroDecision {
  const { email, text, profile, similar, pairCount, ctx } = input;
  const threadKey = computeThreadKey(email);
  const category = categorizeEmail(email.subject || '', text);
  const historyReady = pairCount >= MIN_PAIRS_FOR_HISTORY;
  const styleReady = !!profile && profile.sampleCount >= MIN_STYLE_SAMPLES;
  const extra: AstroTrigger[] = [];

  let proposal: GuardProposal;
  let draft: AstroSuggestedReply | null = null;
  let usedIds: number[] = [];
  let removed: SensitiveItem[] = [];
  let bestSimilarity = 0;

  if (!historyReady) {
    // "Cold start": continua o Astro de sempre; nada de rascunho pelo histórico ainda
    proposal = { action: 'apenas_classificar', complexity: 'pensada', confidence: 0 };
    extra.push('historico_insuficiente');
  } else if (similar.length === 0) {
    proposal = { action: 'escalar_humano', complexity: 'pensada', confidence: 0, noPattern: true };
  } else {
    const best = similar[0];
    bestSimilarity = best.similarity;
    const allowed = [email.subject, text, email.sender, email.senderEmail, email.replyTo, input.ownContext].filter(Boolean).join('\n');
    const clean = sanitizeAnswer(best.pair.answer, allowed);
    removed = clean.removed;
    const words = wordCount(clean.text);
    const bestTokens = tokenize(best.pair.answer);
    const others = similar.slice(1);
    const agreement = others.length
      ? others.reduce((s, o) => s + cosineSimilarity(bestTokens, tokenize(o.pair.answer)), 0) / others.length
      : 0;
    const questionMarks = (text.match(/\?/g) || []).length;
    const simple =
      best.similarity >= 0.45 &&
      words > 0 &&
      words <= 80 &&
      wordCount(text) <= 200 &&
      questionMarks <= 2 &&
      removed.length === 0 &&
      !ALWAYS_THOUGHTFUL.includes(category);
    const confidence = round2(
      0.55 * best.similarity + 0.25 * agreement + (styleReady ? 0.1 : 0) + (words > 0 && words <= 60 ? 0.1 : 0) - (removed.length ? 0.15 : 0)
    );
    if (clean.leak || !clean.text) {
      proposal = { action: 'escalar_humano', complexity: 'pensada', confidence, leakDetected: clean.leak };
    } else {
      draft = composeReply(email, clean.text, profile, styleReady, ctx.config);
      usedIds = similar.map((s) => s.pair.id);
      proposal = { action: 'enviar_automatico', complexity: simple ? 'simples' : 'pensada', confidence };
    }
  }

  const guarded = applyGuards(email, ctx, proposal);
  const triggers = Array.from(new Set<AstroTrigger>([...guarded.triggers, ...extra]));
  // Sem rascunho quando só classifica ou quando precisa de você (golpe, automático, vazamento...)
  if (guarded.classifyOnly || guarded.action === 'apenas_classificar' || guarded.action === 'escalar_humano') {
    draft = null;
    usedIds = guarded.classifyOnly ? [] : usedIds;
  }
  const automated = guarded.classifyOnly && triggers.some((t) => AUTOMATION.includes(t));

  return {
    versao: 1,
    email_id: email.id,
    thread_key: threadKey,
    categoria: automated ? 'automatico' : category,
    complexidade: proposal.complexity,
    score_confianca: proposal.confidence,
    acao: guarded.action,
    travas_acionadas: triggers,
    justificativa: buildJustification(triggers, usedIds.length, bestSimilarity, pairCount, removed.length, guarded.classifyOnly),
    pares_utilizados_ids: usedIds,
    resposta_sugerida: draft,
    dados_removidos: removed,
    estilo_aplicado: !!draft && (styleReady || !!ctx.config.greetingOverride || !!ctx.config.closingOverride),
  };
}
