import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { EmailItem } from '@/types/email';
import { isBodyStripped } from '../utils/emailBodyStrip';

/**
 * Conteúdo (texto + HTML) dos e-mails carregado sob demanda do banco local.
 *
 * Na memória do app ficam só os resumos; ao abrir um e-mail, o conteúdo é buscado aqui.
 * Mantém os últimos ~300 conteúdos usados (para reabrir na hora).
 */

type Body = { body?: string; bodyHtml?: string };

const MAX_ENTRIES = 300;
const cache = new Map<string, Body>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  for (const l of listeners) l();
};

const touch = (id: string, value: Body) => {
  cache.delete(id);
  cache.set(id, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

/** Guarda um conteúdo que o app já tem em mãos (ex.: e-mail recém-baixado). */
export const rememberBody = (id: string, body: Body): void => {
  touch(id, body);
};

export const getCachedBody = (id: string): Body | undefined => cache.get(id);

/** Busca no banco os conteúdos que ainda não estão em memória. */
export const loadBodies = (ids: string[]): Promise<void> => {
  const api = window.electronAPI?.storeGetBodies;
  const missing = Array.from(new Set(ids)).filter((id) => id && !cache.has(id) && !inFlight.has(id));
  const waits = ids.map((id) => inFlight.get(id)).filter(Boolean) as Promise<void>[];
  if (!api || missing.length === 0) return Promise.all(waits).then(() => undefined);

  const p = api(missing)
    .then((result) => {
      for (const id of missing) {
        // Sem conteúdo no banco: guarda vazio para não ficar tentando de novo
        touch(id, result?.[id] || { body: '', bodyHtml: undefined });
      }
    })
    .catch(() => {})
    .finally(() => {
      for (const id of missing) inFlight.delete(id);
      emit();
    });
  for (const id of missing) inFlight.set(id, p);
  return Promise.all([p, ...waits]).then(() => undefined);
};

// Mesmo e-mail + mesmo conteúdo → mesmo objeto (evita refazer a tela de leitura a cada renderização)
const hydratedMemo = new WeakMap<object, { b: Body; out: EmailItem }>();

/** E-mail com o conteúdo (se já estiver carregado). Não altera o objeto original. */
export function hydrateEmail<T extends EmailItem | null | undefined>(email: T): T {
  if (!email || !isBodyStripped(email)) return email;
  const b = cache.get(email.id);
  if (!b) return email;
  const memo = hydratedMemo.get(email);
  if (memo && memo.b === b) return memo.out as T;
  const out = { ...email, body: b.body ?? '', bodyHtml: b.bodyHtml } as EmailItem;
  hydratedMemo.set(email, { b, out });
  return out as T;
}

/** Garante o conteúdo de um e-mail (aguarda o banco, se preciso). */
export async function ensureEmailBody(email: EmailItem): Promise<EmailItem> {
  if (!isBodyStripped(email)) return email;
  await loadBodies([email.id]);
  return hydrateEmail(email);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

/**
 * Hook: devolve os e-mails com conteúdo, carregando do banco os que faltam.
 * Enquanto carrega, devolve o e-mail sem conteúdo (a tela mostra o resumo).
 */
export function useHydratedEmails(list: Array<EmailItem | null | undefined>): Array<EmailItem | null | undefined> {
  const v = useSyncExternalStore(subscribe, getVersion);
  const key = list.map((e) => (e ? e.id : '')).join('|');
  useEffect(() => {
    const need = list.filter((e): e is EmailItem => Boolean(e && isBodyStripped(e) && !cache.has(e.id))).map((e) => e.id);
    if (need.length > 0) void loadBodies(need);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => list.map((e) => hydrateEmail(e)), [list, v]);
}
