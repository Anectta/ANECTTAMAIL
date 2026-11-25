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
  options: { enabled: boolean; myAddresses: string[]; followUpAfterDays: number }
) {
  const { enabled, myAddresses, followUpAfterDays } = options;
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
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

  // Busca no banco o texto dos candidatos que só têm o resumo em memória.
  const missing = useMemo(
    () => candidates.filter((c) => isBodyStripped(c.email) && !texts.has(c.email.id)).map((c) => c.email.id),
    [candidates, texts]
  );
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

  const agenda = useMemo(() => {
    if (!enabled) return EMPTY;
    const withText = deferredEmails.map((e) => {
      const t = texts.get(e.id);
      return t !== undefined && isBodyStripped(e) ? { ...e, body: t, bodyHtml: undefined } : e;
    });
    return computeAstroAgenda(withText, { myAddresses, dismissed, followUpAfterDays });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, deferredEmails, texts, addressesKey, dismissed, followUpAfterDays]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  return { agenda, dismiss };
}
