import { useEffect } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Espera a sincronização inicial antes da primeira verificação. */
const FIRST_CHECK_DELAY_MS = 60_000;
const CHECK_EVERY_MS = 60 * 60_000;

export const astroLastLearnKey = (accountEmail: string) => `anectta_astro_last_learn_${accountEmail.trim().toLowerCase()}`;

/**
 * Astro Respostas Inteligentes — atualiza o aprendizado sozinho uma vez por dia (com o app aberto),
 * só nas contas em que a opção está ligada. A rotina só processa o que for novo.
 */
export function useAstroAutoLearning(accountEmails: string[]): void {
  const key = accountEmails.map((a) => a.trim().toLowerCase()).filter(Boolean).sort().join('|');

  useEffect(() => {
    const api = window.electronAPI;
    const accounts = key ? key.split('|') : [];
    if (!api?.astroGetConfig || !api.astroLearnStart || accounts.length === 0) return;
    let cancelled = false;

    const check = async () => {
      for (const acc of accounts) {
        if (cancelled) return;
        let last = 0;
        try {
          last = Number(localStorage.getItem(astroLastLearnKey(acc)) || 0);
        } catch {}
        if (Date.now() - last < DAY_MS) continue;
        try {
          const cfg = await api.astroGetConfig!(acc);
          if (!cfg || cfg.autonomy === 'desligado') continue;
          try {
            localStorage.setItem(astroLastLearnKey(acc), String(Date.now()));
          } catch {}
          await api.astroLearnStart!({ accountEmail: acc, myAddresses: accounts });
        } catch {
          // Sem banco local ou erro pontual: tenta de novo na próxima verificação
        }
      }
    };

    const first = window.setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [key]);
}
