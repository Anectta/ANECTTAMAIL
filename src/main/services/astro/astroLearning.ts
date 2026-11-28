/**
 * Astro Respostas Inteligentes — rotina de aprendizado (processo principal).
 *
 * 1) Pareia e-mails recebidos com as suas respostas (só resumos, rápido).
 * 2) Para os pares novos, lê o conteúdo (decifrado em memória), limpa e grava cifrado.
 * 3) Extrai o "DNA de escrita" dos últimos e-mails enviados.
 * Tudo em lotes pequenos com pausas entre eles, para não travar a interface.
 */
import { buildHistoryPairs, type PairableMeta } from './pairing';
import { AstroStore } from './astroStore';
import { cleanEmailText, splitGreetingAndClosing } from './textClean';
import { extractStyleProfile, type StyleProfile } from './styleProfile';
import { normalizeSubject } from './replyGuard';

export interface LearningSource {
  listMetas: (accountEmail: string, sinceMs: number) => PairableMeta[];
  getBodies: (ids: string[]) => Record<string, { body?: string; bodyHtml?: string }>;
}

export interface LearningStatus {
  accountEmail: string;
  running: boolean;
  phase: 'parado' | 'pareando' | 'lendo_pares' | 'estilo' | 'concluido' | 'erro';
  done: number;
  total: number;
  pairsAdded: number;
  pairsTotal: number;
  styleSamples: number;
  startedMs?: number;
  finishedMs?: number;
  error?: string;
}

/** Quanto do histórico é usado: últimos 12 meses. */
export const HISTORY_WINDOW_MS = 365 * 24 * 3_600_000;
/** Quantos e-mails enviados formam o perfil de estilo. */
export const STYLE_SAMPLE_SIZE = 300;
const BATCH = 25;
/** Pares com resposta muito longa raramente servem de modelo. */
const MAX_ANSWER_CHARS = 4000;

const pause = () => new Promise<void>((r) => setImmediate(r));
const dateOf = (m: PairableMeta) => new Date(m.receivedDateStr || m.dateStr || 0).getTime() || 0;

export async function runLearning(
  accountEmail: string,
  myAddresses: string[],
  source: LearningSource,
  store: AstroStore,
  onProgress: (s: LearningStatus) => void,
  nowMs = Date.now()
): Promise<LearningStatus> {
  const status: LearningStatus = {
    accountEmail,
    running: true,
    phase: 'pareando',
    done: 0,
    total: 0,
    pairsAdded: 0,
    pairsTotal: store.countPairs(accountEmail),
    styleSamples: 0,
    startedMs: nowMs,
  };
  const emit = () => onProgress({ ...status });
  emit();

  try {
    const metas = source.listMetas(accountEmail, nowMs - HISTORY_WINDOW_MS);
    const mine = Array.from(new Set([accountEmail, ...myAddresses].map((a) => a.trim().toLowerCase()).filter(Boolean)));
    await pause();

    // 1) Pares (só resumos)
    const known = store.knownOutboundIds(accountEmail);
    const pairs = buildHistoryPairs(metas, mine).filter((p) => !known.has(p.outboundId));

    // Assinatura conhecida: calculada antes, para limpar as respostas
    const isSent = (m: PairableMeta) => (m.folder || '').toLowerCase() === 'sent' || mine.includes((m.senderEmail || '').toLowerCase());
    const sentMetas = metas
      .filter((m) => isSent(m) && !/^\s*(fw|fwd|enc|tr)\s*:/i.test(m.subject || ''))
      .sort((a, b) => dateOf(b) - dateOf(a))
      .slice(0, STYLE_SAMPLE_SIZE);

    // 2) Estilo primeiro (fornece a assinatura para limpar os pares)
    status.phase = 'estilo';
    status.done = 0;
    status.total = sentMetas.length;
    emit();
    const sentTexts: string[] = [];
    for (let i = 0; i < sentMetas.length; i += BATCH) {
      const slice = sentMetas.slice(i, i + BATCH);
      const bodies = source.getBodies(slice.map((m) => m.id));
      for (const m of slice) {
        const b = bodies[m.id];
        if (!b) continue;
        const text = cleanEmailText(b);
        if (text) sentTexts.push(text);
      }
      status.done = Math.min(sentMetas.length, i + BATCH);
      emit();
      await pause();
    }
    let profile: StyleProfile | null = null;
    if (sentTexts.length > 0) {
      profile = extractStyleProfile(sentTexts, Date.now());
      store.saveProfile(accountEmail, profile);
    }
    status.styleSamples = sentTexts.length;

    // 3) Conteúdo dos pares novos
    status.phase = 'lendo_pares';
    status.done = 0;
    status.total = pairs.length;
    emit();
    const metaById = new Map(metas.map((m) => [m.id, m]));
    const signature = profile?.signatureLines || [];
    for (let i = 0; i < pairs.length; i += BATCH) {
      const slice = pairs.slice(i, i + BATCH);
      const bodies = source.getBodies(slice.flatMap((p) => [p.inboundId, p.outboundId]));
      for (const p of slice) {
        const inb = bodies[p.inboundId];
        const out = bodies[p.outboundId];
        if (!inb || !out) continue;
        const question = cleanEmailText(inb);
        const answer = splitGreetingAndClosing(cleanEmailText(out, signature)).body;
        if (!question || !answer || answer.length > MAX_ANSWER_CHARS) continue;
        const inMeta = metaById.get(p.inboundId);
        const added = store.insertPair(accountEmail, p, {
          question,
          answer,
          subject: normalizeSubject(inMeta?.subject),
          counterpart: (inMeta?.senderEmail || '').toLowerCase(),
        });
        if (added) status.pairsAdded++;
      }
      status.done = Math.min(pairs.length, i + BATCH);
      emit();
      await pause();
    }

    status.pairsTotal = store.countPairs(accountEmail);
    status.phase = 'concluido';
  } catch (err: any) {
    status.phase = 'erro';
    status.error = err?.message || String(err);
  }
  status.running = false;
  status.finishedMs = Date.now();
  emit();
  return status;
}
