import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { EmailItem } from '@/types/email';
import { htmlToText } from '../utils/assistantInsights';
import {
  computeAstroAgenda,
  findAgendaCandidates,
  loadDismissed,
  saveDismissed,
  type AstroAgenda,
} from '../utils/astroAgenda';
import { isBodyStripped } from '../utils/emailBodyStrip';
import { computeDailyDigest, isDailyCandidate, type DailyDigest } from '../utils/astroDaily';
import {
  computeCleanupSuggestions,
  loadKeptSenders,
  saveKeptSenders,
  type CleanupSuggestion,
} from '../utils/astroCleanup';

const EMPTY: AstroAgenda = { needsReply: [], awaitingAnswer: [] };
/** Quantos candidatos têm o texto buscado por vez no banco local. */
const BATCH = 200;
/** Trecho do texto guardado por e-mail (o suficiente para achar a pergunta/pedido). */
const EXCERPT = 4000;

/**
 * Pendências do Astro ("Aguardando sua resposta" e "Sem resposta").
 * Na memória do app ficam só os resumos dos e-mails; aqui o texto é buscado no banco
 * local apenas para os candidatos (recentes, de pessoas e sem resposta), em trechos curtos.
 */
export function useAstroAgenda(
  emails: EmailItem[],
  options: {
    enabled: boolean;
    cleanupEnabled: boolean;
    myAddresses: string[];
    followUpAfterDays: number;
    /** Resumo do dia (prazos, reuniões, VIPs, newsletters). */
    dailyEnabled?: boolean;
    vips?: Set<string>;
  }
) {
  const { enabled, cleanupEnabled, myAddresses, followUpAfterDays, dailyEnabled = false, vips } = options;
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [keptSenders, setKeptSenders] = useState<Set<string>>(() => loadKeptSenders());
  const [texts, setTexts] = useState<Map<string, string>>(() => new Map());
  const deferredEmails = useDeferredValue(emails);
  const addressesKey = myAddresses.join('|');

  const candidates = useMemo(
    () =>
      enabled
        ? findAgendaCandidates(deferredEmails, { myAddresses, dismissed, followUpAfterDays })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, deferredEmails, addressesKey, dismissed, followUpAfterDays]
  );

  // E-mails recentes que falam de pagamento/reunião (para o Resumo do dia)
  const dailyCandidates = useMemo(
    () => (dailyEnabled ? deferredEmails.filter((e) => isDailyCandidate(e, Date.now())) : []),
    [dailyEnabled, deferredEmails]
  );

  // Busca no banco o texto dos candidatos que só têm o resumo em memória.
  const missing = useMemo(() => {
    const ids = new Set<string>();
    for (const c of candidates) if (isBodyStripped(c.email) && !texts.has(c.email.id)) ids.add(c.email.id);
    for (const e of dailyCandidates) if (isBodyStripped(e) && !texts.has(e.id)) ids.add(e.id);
    return [...ids];
  }, [candidates, dailyCandidates, texts]);
  const missingKey = missing.slice(0, BATCH).join('|');
  useEffect(() => {
    const api = window.electronAPI?.storeGetBodies;
    const ids = missingKey ? missingKey.split('|') : [];
    if (!api || ids.length === 0) return;
    let cancelled = false;
    api(ids)
      .then((result: Record<string, { body?: string; bodyHtml?: string }> | undefined) => {
        if (cancelled) return;
        setTexts((prev) => {
          const next = new Map(prev);
          for (const id of ids) {
            const b = result?.[id];
            const text = b?.body?.trim() ? b.body : b?.bodyHtml ? htmlToText(b.bodyHtml) : '';
            next.set(id, (text || '').slice(0, EXCERPT));
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  // E-mails com o trecho de texto já carregado (só os candidatos ganham o texto)
  const withText = useMemo(
    () =>
      deferredEmails.map((e) => {
        const t = texts.get(e.id);
        return t !== undefined && isBodyStripped(e) ? { ...e, body: t, bodyHtml: undefined } : e;
      }),
    [deferredEmails, texts]
  );

  const agenda = useMemo(() => {
    if (!enabled) return EMPTY;
    return computeAstroAgenda(withText, { myAddresses, dismissed, followUpAfterDays });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, withText, addressesKey, dismissed, followUpAfterDays]);

  const daily = useMemo<DailyDigest>(
    () =>
      dailyEnabled
        ? computeDailyDigest(withText, { vips })
        : { payments: [], meetings: [], vipUnread: [], newslettersUnread: 0 },
    [dailyEnabled, withText, vips]
  );

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  // Sugestões de limpeza: só com o resumo dos e-mails (não precisa do texto).
  const cleanup = useMemo<CleanupSuggestion[]>(
    () => (cleanupEnabled ? computeCleanupSuggestions(deferredEmails, { myAddresses, keptSenders }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cleanupEnabled, deferredEmails, addressesKey, keptSenders]
  );

  /** "Manter": o remetente não volta a ser sugerido para limpeza. */
  const keepSender = useCallback((senderEmail: string) => {
    setKeptSenders((prev) => {
      const next = new Set(prev);
      next.add(senderEmail.toLowerCase());
      saveKeptSenders(next);
      return next;
    });
  }, []);

  return { agenda, dismiss, cleanup, keepSender, daily };
}
