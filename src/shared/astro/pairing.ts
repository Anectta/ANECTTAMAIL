/**
 * Astro Respostas Inteligentes — pareamento "e-mail recebido → resposta enviada".
 *
 * Usa só os resumos (sem conteúdo): a resposta enviada aponta para o e-mail original pelo
 * In-Reply-To (ou, na falta, pelo último ID do References), que deve ser o Message-ID do recebido.
 */
import { computeThreadKey, headerAutomationTriggers, senderAutomationTriggers, type GuardEmail } from './replyGuard';

export interface PairableMeta extends GuardEmail {
  folder?: string;
}

export interface HistoryPair {
  inboundId: string;
  outboundId: string;
  threadKey: string;
  inDateMs: number;
  outDateMs: number;
}

/** Intervalo máximo entre o e-mail e a resposta para virar exemplo (respostas muito tardias costumam ser outro assunto). */
export const MAX_REPLY_GAP_MS = 30 * 24 * 3_600_000;

const cleanId = (v: string | undefined) => (v || '').trim().replace(/^<|>$/g, '').toLowerCase();

const dateOf = (m: PairableMeta): number => {
  for (const v of [m.receivedDateStr, m.dateStr]) {
    if (v) {
      const t = new Date(v).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  return Number.NaN;
};

const isForward = (subject: string | undefined) => /^\s*(fw|fwd|enc|tr|wg)\s*(\[\d+\])?\s*:/i.test(subject || '');

/**
 * Monta os pares a partir dos resumos de uma conta.
 * - Enviado = pasta "sent" ou remetente é um dos endereços do usuário.
 * - Recebido = os demais (que não sejam automáticos/promocionais).
 * - Encaminhamentos não viram exemplo. Para cada recebido, fica só a primeira resposta.
 */
export function buildHistoryPairs(metas: PairableMeta[], myAddresses: string[]): HistoryPair[] {
  const mine = new Set(myAddresses.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const isMine = (m: PairableMeta) => (m.folder || '').toLowerCase() === 'sent' || mine.has((m.senderEmail || '').trim().toLowerCase());

  const inboundByMsgId = new Map<string, PairableMeta>();
  const outbound: PairableMeta[] = [];
  for (const m of metas) {
    if (!m || !m.id) continue;
    if (isMine(m)) {
      outbound.push(m);
    } else {
      const mid = cleanId(m.messageIdHeader);
      if (mid && !inboundByMsgId.has(mid)) inboundByMsgId.set(mid, m);
    }
  }

  const best = new Map<string, HistoryPair>();
  for (const out of outbound) {
    if (isForward(out.subject)) continue;
    const refs = out.referencesHeader || [];
    const parentId = cleanId(out.inReplyToHeader) || cleanId(refs[refs.length - 1]);
    if (!parentId) continue;
    const inb = inboundByMsgId.get(parentId);
    if (!inb) continue;
    if (senderAutomationTriggers(inb.senderEmail).length > 0 || headerAutomationTriggers(inb).length > 0) continue;
    const inDate = dateOf(inb);
    const outDate = dateOf(out);
    if (Number.isNaN(inDate) || Number.isNaN(outDate)) continue;
    if (outDate < inDate || outDate - inDate > MAX_REPLY_GAP_MS) continue;
    const prev = best.get(inb.id);
    if (prev && prev.outDateMs <= outDate) continue;
    best.set(inb.id, {
      inboundId: inb.id,
      outboundId: out.id,
      threadKey: computeThreadKey(inb),
      inDateMs: inDate,
      outDateMs: outDate,
    });
  }
  return Array.from(best.values()).sort((a, b) => b.outDateMs - a.outDateMs);
}
