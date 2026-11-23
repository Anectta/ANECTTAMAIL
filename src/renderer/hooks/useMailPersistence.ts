import { useCallback, useEffect, useRef } from 'react';
import type { EmailItem } from '@/types/email';
import type { AccountSettings } from '@/types/settings';

/**
 * Gravações em disco dos e-mails, sem travar o app.
 *
 *  1. Cache do app (mail-cache.bin): agrupa as mudanças — grava 5 s depois da última mudança,
 *     e no máximo a cada 30 s enquanto as mudanças não param (ex.: download em andamento).
 *  2. Índice de pesquisa: envia só os e-mails NOVOS ou ALTERADOS (comparando a referência do
 *     objeto — o React cria um objeto novo a cada alteração), não todos de novo.
 *  3. Cópias .pst/.mbox em Documentos: só das contas que mudaram, no máximo a cada 10 minutos.
 *  Ao fechar o app, flushAll() grava tudo o que estiver pendente.
 */

const CACHE_DEBOUNCE_MS = 5_000;
const CACHE_MAX_WAIT_MS = 30_000;
const INDEX_DEBOUNCE_MS = 5_000;
const MAILBOX_COPY_INTERVAL_MS = 10 * 60_000;

export interface MailPersistenceOptions {
  emails: EmailItem[];
  accounts: AccountSettings[];
  isEmailForAccount: (m: EmailItem, acc: AccountSettings) => boolean;
}

/** Só os campos usados pela pesquisa (evita enviar o HTML dos e-mails entre processos). */
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

export function useMailPersistence(opts: MailPersistenceOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // ---------- 1. Cache do app ----------
  const cacheTimerRef = useRef<number | null>(null);
  const cacheFirstPendingAtRef = useRef<number | null>(null);
  const cacheDirtyRef = useRef(false);
  const mountedRef = useRef(false);

  const writeCache = useCallback(() => {
    cacheDirtyRef.current = false;
    cacheFirstPendingAtRef.current = null;
    if (cacheTimerRef.current) {
      window.clearTimeout(cacheTimerRef.current);
      cacheTimerRef.current = null;
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
      // O carregamento inicial veio do próprio cache: não precisa regravar
      mountedRef.current = true;
      return;
    }
    cacheDirtyRef.current = true;
    const now = Date.now();
    if (cacheFirstPendingAtRef.current === null) cacheFirstPendingAtRef.current = now;
    if (cacheTimerRef.current) window.clearTimeout(cacheTimerRef.current);
    const waited = now - cacheFirstPendingAtRef.current;
    const delay = Math.max(0, Math.min(CACHE_DEBOUNCE_MS, CACHE_MAX_WAIT_MS - waited));
    cacheTimerRef.current = window.setTimeout(() => {
      if (typeof (window as any).requestIdleCallback === 'function') {
        (window as any).requestIdleCallback(writeCache, { timeout: 2500 });
      } else {
        writeCache();
      }
    }, delay);
  }, [opts.emails, writeCache]);

  // ---------- 2. Índice de pesquisa + 3. contas com mudanças ----------
  const lastSeenRef = useRef<Map<string, EmailItem> | null>(null);
  const dirtyAccountsRef = useRef(new Set<string>());
  const indexTimerRef = useRef<number | null>(null);

  const accountEmailOf = useCallback((e: EmailItem): string | undefined => {
    const { accounts, isEmailForAccount } = optsRef.current;
    return accounts.find((acc) => acc?.email && isEmailForAccount(e, acc))?.email;
  }, []);

  /** Compara com o último estado visto e envia ao índice só o que mudou. */
  const processChanges = useCallback(async () => {
    if (indexTimerRef.current) {
      window.clearTimeout(indexTimerRef.current);
      indexTimerRef.current = null;
    }
    const api = window.electronAPI;
    const emails = optsRef.current.emails;
    const prev = lastSeenRef.current;
    const next = new Map<string, EmailItem>();
    for (const e of emails) next.set(e.id, e);
    lastSeenRef.current = next;

    let changed: EmailItem[];
    let removedIds: string[] = [];
    if (prev === null) {
      // Primeira vez na sessão: o índice já está no disco; pede só os que faltam nele
      changed = [];
      if (api?.getUnindexedEmailIds) {
        try {
          const missing = new Set(await api.getUnindexedEmailIds(emails.map((e) => e.id)));
          if (missing.size > 0) changed = emails.filter((e) => missing.has(e.id));
        } catch {}
      }
    } else {
      changed = emails.filter((e) => prev.get(e.id) !== e);
      for (const [id, old] of prev) {
        if (!next.has(id)) {
          removedIds.push(id);
          const accEmail = accountEmailOf(old);
          if (accEmail) dirtyAccountsRef.current.add(accEmail);
        }
      }
    }

    if (changed.length > 0) {
      const byAccount = new Map<string, EmailItem[]>();
      for (const e of changed) {
        const accEmail = accountEmailOf(e) || '';
        if (prev !== null && accEmail) dirtyAccountsRef.current.add(accEmail);
        const list = byAccount.get(accEmail) || [];
        list.push(e);
        byAccount.set(accEmail, list);
      }
      if (api?.indexEmailsFts) {
        for (const [accEmail, list] of byAccount) {
          // Lotes moderados para não travar o processo principal
          for (let i = 0; i < list.length; i += 500) {
            try {
              await api.indexEmailsFts({
                emails: list.slice(i, i + 500).map(toIndexable),
                accountEmail: accEmail || undefined,
              });
            } catch {}
          }
        }
      }
    }
    if (removedIds.length > 0 && api?.removeIndexedEmails) {
      try {
        await api.removeIndexedEmails(removedIds);
      } catch {}
    }
  }, [accountEmailOf]);

  useEffect(() => {
    // Processa no máximo uma vez a cada 5 s (não adia indefinidamente durante downloads contínuos)
    if (indexTimerRef.current) return;
    indexTimerRef.current = window.setTimeout(() => void processChanges(), INDEX_DEBOUNCE_MS);
  }, [opts.emails, processChanges]);

  // ---------- 3. Cópias .pst/.mbox ----------
  const savingCopiesRef = useRef(false);
  const saveMailboxCopies = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.saveLocalMailbox || savingCopiesRef.current) return;
    if (dirtyAccountsRef.current.size === 0) return;
    savingCopiesRef.current = true;
    const targets = Array.from(dirtyAccountsRef.current);
    dirtyAccountsRef.current.clear();
    try {
      const { accounts, emails, isEmailForAccount } = optsRef.current;
      for (const accEmail of targets) {
        const acc = accounts.find((a) => a?.email === accEmail);
        if (!acc) continue;
        try {
          await api.saveLocalMailbox({
            accountEmail: acc.email,
            protocol: acc.incomingServer?.protocol || 'pop3',
            emails: emails.filter((m) => isEmailForAccount(m, acc)),
          });
        } catch (err) {
          console.warn('Erro ao gravar arquivo .pst em disco:', err);
          dirtyAccountsRef.current.add(accEmail); // tenta de novo no próximo ciclo
        }
      }
    } finally {
      savingCopiesRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void saveMailboxCopies(), MAILBOX_COPY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [saveMailboxCopies]);

  /** Ao fechar o app: grava tudo o que estiver pendente (cache, índice e cópias). */
  const flushAll = useCallback(async () => {
    try {
      await processChanges();
    } catch {}
    try {
      if (cacheDirtyRef.current) {
        const json = JSON.stringify(optsRef.current.emails);
        if (window.electronAPI?.saveMessageCacheNow) {
          await window.electronAPI.saveMessageCacheNow(json);
        } else {
          writeCache();
        }
        cacheDirtyRef.current = false;
      }
    } catch {}
    try {
      await saveMailboxCopies();
    } catch {}
  }, [processChanges, saveMailboxCopies, writeCache]);

  return { flushAll };
}
