import { useCallback, useEffect, useRef } from 'react';
import type { EmailItem } from '@/types/email';
import type { AccountSettings } from '@/types/settings';
import { stripEmailBody } from '../utils/emailBodyStrip';
import { rememberBody } from '../services/emailBodyCache';

/**
 * Gravação dos e-mails em disco, sem travar o app.
 *
 * Modo BANCO (padrão, banco SQLite disponível):
 *  - A cada ~2 s, grava no banco só os e-mails NOVOS, ALTERADOS ou EXCLUÍDOS (compara a referência
 *    do objeto — o React cria um objeto novo a cada alteração). O banco também mantém a pesquisa.
 *  - Depois de gravar, tira o conteúdo (texto/HTML) da memória: fica só o resumo; o conteúdo volta
 *    do banco quando o e-mail é aberto (services/emailBodyCache).
 *
 * Modo ANTIGO (só se o banco não abrir): arquivo único mail-cache.bin + índice de pesquisa antigo.
 *
 * Nos dois modos, as cópias .pst/.mbox em Documentos são gravadas só das contas que mudaram,
 * no máximo a cada 10 minutos, e tudo o que estiver pendente é gravado ao fechar o app (flushAll).
 */

const STORE_THROTTLE_MS = 2_000;
const STORE_BATCH = 200;
const LEGACY_CACHE_DEBOUNCE_MS = 5_000;
const LEGACY_CACHE_MAX_WAIT_MS = 30_000;
const LEGACY_INDEX_THROTTLE_MS = 5_000;
const MAILBOX_COPY_INTERVAL_MS = 10 * 60_000;

export interface MailPersistenceOptions {
  emails: EmailItem[];
  setEmails: React.Dispatch<React.SetStateAction<EmailItem[]>>;
  accounts: AccountSettings[];
  isEmailForAccount: (m: EmailItem, acc: AccountSettings) => boolean;
}

/** Só os campos usados pela pesquisa antiga (modo sem banco). */
const toIndexable = (e: EmailItem) => ({
  id: e.id,
  accountId: e.accountId,
  sender: e.sender,
  senderEmail: e.senderEmail,
  recipient: e.recipient,
  subject: e.subject,
  snippet: e.snippet,
  body: e.body,
  folder: e.folder,
  attachments: (e.attachments || []).map((a) => ({ name: a.name })),
});

/** Compara o estado atual com o último gravado: o que é novo/alterado e o que saiu. */
export function diffEmails(prev: Map<string, EmailItem>, emails: EmailItem[]) {
  const next = new Map<string, EmailItem>();
  for (const e of emails) next.set(e.id, e);
  const changed = emails.filter((e) => prev.get(e.id) !== e);
  const removed: EmailItem[] = [];
  for (const [id, old] of prev) if (!next.has(id)) removed.push(old);
  return { next, changed, removed };
}

/** Registros para o banco + os e-mails cujo conteúdo sai da memória depois de gravado. */
export function buildStoreRecords(changed: EmailItem[], accountOf: (e: EmailItem) => string | undefined) {
  const strips = new Map<string, { from: EmailItem; to: EmailItem }>();
  const records = changed.map((e) => {
    const s = stripEmailBody(e as any);
    if (s.hasBody) strips.set(e.id, { from: e, to: s.meta as EmailItem });
    return {
      meta: s.meta,
      body: s.body,
      bodyHtml: s.bodyHtml,
      hasBody: s.hasBody,
      accountEmail: accountOf(e) || undefined,
    };
  });
  return { records, strips };
}

/** Troca, no estado, os objetos gravados pelos resumos (só se não foram alterados nesse meio-tempo). */
export function applyStrips(prevEmails: EmailItem[], strips: Map<string, { from: EmailItem; to: EmailItem }>) {
  let touched = false;
  const out = prevEmails.map((x) => {
    const s = strips.get(x.id);
    if (s && x === s.from) {
      touched = true;
      return s.to;
    }
    return x;
  });
  return touched ? out : prevEmails;
}

/** O banco abriu nesta sessão? (decidido uma vez, ao abrir o app) */
export const isMailStoreAvailable = (() => {
  let cached: boolean | null = null;
  return (): boolean => {
    if (cached === null) {
      try {
        cached = Boolean(window.electronAPI?.getMailStoreStatusSync?.()?.available);
      } catch {
        cached = false;
      }
    }
    return cached;
  };
})();

export function useMailPersistence(opts: MailPersistenceOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const storeMode = isMailStoreAvailable();

  // Estado de referência = o que veio do disco ao abrir (capturado já na primeira renderização,
  // para que mudanças logo no início — ex.: sincronização de abertura — também sejam gravadas)
  const lastSeenRef = useRef<Map<string, EmailItem> | null>(null);
  if (lastSeenRef.current === null) {
    lastSeenRef.current = new Map(opts.emails.map((e) => [e.id, e]));
  }
  const dirtyAccountsRef = useRef(new Set<string>());
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef<Promise<void> | null>(null);

  const accountEmailOf = useCallback((e: EmailItem): string | undefined => {
    const { accounts, isEmailForAccount } = optsRef.current;
    return accounts.find((acc) => acc?.email && isEmailForAccount(e, acc))?.email;
  }, []);

  // ---------- Cache antigo (só no modo sem banco) ----------
  const legacyTimerRef = useRef<number | null>(null);
  const legacyFirstPendingRef = useRef<number | null>(null);
  const legacyDirtyRef = useRef(false);
  const mountedRef = useRef(false);

  const writeLegacyCache = useCallback(() => {
    legacyDirtyRef.current = false;
    legacyFirstPendingRef.current = null;
    if (legacyTimerRef.current) {
      window.clearTimeout(legacyTimerRef.current);
      legacyTimerRef.current = null;
    }
    try {
      const json = JSON.stringify(optsRef.current.emails);
      if (window.electronAPI?.saveMessageCache) {
        window.electronAPI.saveMessageCache(json);
        localStorage.removeItem('anectta_mail_messages');
      } else {
        localStorage.setItem('anectta_mail_messages', json);
      }
    } catch (e) {
      console.warn('Erro ao salvar e-mails localmente:', e);
    }
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true; // o estado inicial veio do próprio disco
      return;
    }
    if (storeMode) return;
    legacyDirtyRef.current = true;
    const now = Date.now();
    if (legacyFirstPendingRef.current === null) legacyFirstPendingRef.current = now;
    if (legacyTimerRef.current) window.clearTimeout(legacyTimerRef.current);
    const waited = now - legacyFirstPendingRef.current;
    const delay = Math.max(0, Math.min(LEGACY_CACHE_DEBOUNCE_MS, LEGACY_CACHE_MAX_WAIT_MS - waited));
    legacyTimerRef.current = window.setTimeout(() => {
      if (typeof (window as any).requestIdleCallback === 'function') {
        (window as any).requestIdleCallback(writeLegacyCache, { timeout: 2500 });
      } else {
        writeLegacyCache();
      }
    }, delay);
  }, [opts.emails, storeMode, writeLegacyCache]);

  // ---------- Diferenças desde a última gravação ----------
  const runChanges = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const api = window.electronAPI;
    const emails = optsRef.current.emails;
    const prev = lastSeenRef.current || new Map<string, EmailItem>();
    const { next, changed, removed } = diffEmails(prev, emails);
    lastSeenRef.current = next;

    const removedIds = removed.map((old) => old.id);
    for (const old of removed) {
      const accEmail = accountEmailOf(old);
      if (accEmail) dirtyAccountsRef.current.add(accEmail);
    }
    if (changed.length === 0 && removedIds.length === 0) return;

    const accountOf = new Map<string, string>();
    for (const e of changed) {
      const accEmail = accountEmailOf(e) || '';
      accountOf.set(e.id, accEmail);
      if (accEmail) dirtyAccountsRef.current.add(accEmail);
    }

    if (storeMode) {
      // 1) Grava no banco (só o que mudou)
      const strips = new Map<string, { from: EmailItem; to: EmailItem }>();
      for (let i = 0; i < changed.length; i += STORE_BATCH) {
        const slice = changed.slice(i, i + STORE_BATCH);
        const built = buildStoreRecords(slice, (e) => accountOf.get(e.id));
        const records = built.records;
        for (const [id, s] of built.strips) strips.set(id, s);
        try {
          await api?.storeUpsertEmails?.(records);
          for (const r of records) {
            if (r.hasBody) rememberBody(r.meta.id, { body: r.body, bodyHtml: r.bodyHtml });
          }
        } catch (err) {
          console.warn('[store] falha ao gravar e-mails; nova tentativa em seguida:', err);
          // Esquece esses IDs para a próxima rodada tentar de novo
          for (const e of slice) {
            lastSeenRef.current?.delete(e.id);
            strips.delete(e.id);
          }
        }
      }
      if (removedIds.length > 0) {
        try {
          await api?.storeRemoveEmails?.(removedIds);
        } catch (err) {
          console.warn('[store] falha ao excluir e-mails do banco:', err);
        }
      }

      // 2) Tira o conteúdo da memória (fica só o resumo; o conteúdo volta do banco ao abrir)
      if (strips.size > 0) {
        for (const [id, s] of strips) lastSeenRef.current?.set(id, s.to);
        optsRef.current.setEmails((prevEmails) => applyStrips(prevEmails, strips));
      }
      return;
    }

    // Modo antigo: índice de pesquisa só com o que mudou
    if (api?.indexEmailsFts) {
      const byAccount = new Map<string, EmailItem[]>();
      for (const e of changed) {
        const accEmail = accountOf.get(e.id) || '';
        const list = byAccount.get(accEmail) || [];
        list.push(e);
        byAccount.set(accEmail, list);
      }
      for (const [accEmail, list] of byAccount) {
        for (let i = 0; i < list.length; i += 500) {
          try {
            await api.indexEmailsFts({ emails: list.slice(i, i + 500).map(toIndexable), accountEmail: accEmail || undefined });
          } catch {}
        }
      }
    }
    if (removedIds.length > 0 && api?.removeIndexedEmails) {
      try {
        await api.removeIndexedEmails(removedIds);
      } catch {}
    }
  }, [accountEmailOf, storeMode]);

  /** Executa (ou aguarda a execução em andamento) e roda de novo se algo mudou nesse meio-tempo. */
  const processChanges = useCallback(async () => {
    while (runningRef.current) await runningRef.current;
    const p = runChanges().finally(() => {
      runningRef.current = null;
    });
    runningRef.current = p;
    await p;
  }, [runChanges]);

  // Modo antigo: ao abrir, indexa os e-mails que faltam no índice de pesquisa antigo
  useEffect(() => {
    if (storeMode) return;
    const api = window.electronAPI;
    if (!api?.getUnindexedEmailIds || !api.indexEmailsFts) return;
    const emails = optsRef.current.emails;
    void (async () => {
      try {
        const missing = new Set(await api.getUnindexedEmailIds!(emails.map((e) => e.id)));
        const toIndex = emails.filter((e) => missing.has(e.id));
        for (let i = 0; i < toIndex.length; i += 500) {
          await api.indexEmailsFts({ emails: toIndex.slice(i, i + 500).map(toIndexable) });
        }
      } catch {}
    })();
  }, [storeMode]);

  useEffect(() => {
    // No máximo uma vez a cada ~2 s (não adia indefinidamente durante downloads contínuos)
    if (timerRef.current) return;
    timerRef.current = window.setTimeout(
      () => void processChanges(),
      storeMode ? STORE_THROTTLE_MS : LEGACY_INDEX_THROTTLE_MS
    );
  }, [opts.emails, processChanges, storeMode]);

  // ---------- Cópias .pst/.mbox ----------
  const savingCopiesRef = useRef(false);
  const saveMailboxCopies = useCallback(async () => {
    const api = window.electronAPI;
    if (savingCopiesRef.current || dirtyAccountsRef.current.size === 0) return;
    if (storeMode ? !api?.saveLocalMailboxIds : !api?.saveLocalMailbox) return;
    savingCopiesRef.current = true;
    const targets = Array.from(dirtyAccountsRef.current);
    dirtyAccountsRef.current.clear();
    try {
      const { accounts, emails, isEmailForAccount } = optsRef.current;
      for (const accEmail of targets) {
        const acc = accounts.find((a) => a?.email === accEmail);
        if (!acc) continue;
        const accEmails = emails.filter((m) => isEmailForAccount(m, acc));
        try {
          if (storeMode) {
            // O conteúdo completo vem do banco: o app envia só os IDs
            await api!.saveLocalMailboxIds!({
              accountEmail: acc.email,
              protocol: acc.incomingServer?.protocol || 'pop3',
              ids: accEmails.map((m) => m.id),
            });
          } else {
            await api!.saveLocalMailbox({
              accountEmail: acc.email,
              protocol: acc.incomingServer?.protocol || 'pop3',
              emails: accEmails,
            });
          }
        } catch (err) {
          console.warn('Erro ao gravar arquivo .pst em disco:', err);
          dirtyAccountsRef.current.add(accEmail); // tenta de novo no próximo ciclo
        }
      }
    } finally {
      savingCopiesRef.current = false;
    }
  }, [storeMode]);

  useEffect(() => {
    const timer = window.setInterval(() => void saveMailboxCopies(), MAILBOX_COPY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [saveMailboxCopies]);

  /** Ao fechar o app: grava tudo o que estiver pendente. */
  const flushAll = useCallback(async () => {
    try {
      await processChanges();
    } catch {}
    if (!storeMode) {
      try {
        if (legacyDirtyRef.current) {
          const json = JSON.stringify(optsRef.current.emails);
          if (window.electronAPI?.saveMessageCacheNow) {
            await window.electronAPI.saveMessageCacheNow(json);
          } else {
            writeLegacyCache();
          }
          legacyDirtyRef.current = false;
        }
      } catch {}
    }
    try {
      await saveMailboxCopies();
    } catch {}
  }, [processChanges, saveMailboxCopies, storeMode, writeLegacyCache]);

  return { flushAll };
}
