import { useCallback, useEffect, useRef } from 'react';
import type { CustomFolder, EmailItem, MailFolder } from '@/types/email';
import type { AccountSettings } from '@/types/settings';
import { getImapLocation, ImapLocation, SERVER_SYSTEM_FOLDERS } from '../utils/imapLocation';

/**
 * Sincronização app → servidor para contas IMAP.
 *
 * O que o usuário faz no app passa a acontecer também no servidor:
 *  - mover / arquivar / spam / excluir (Lixeira)   → MOVE no servidor
 *  - excluir da Lixeira (definitivo) / descartar rascunho → exclusão no servidor
 *  - lido / não lido / estrela                     → flags \Seen e \Flagged
 *
 * Como funciona:
 *  - Cada e-mail visto pela primeira vez na sessão vira "linha de base" (nada é enviado). Assim,
 *    divergências antigas (de versões anteriores, quando tudo era só local) NÃO são aplicadas
 *    em massa no servidor — só o que o usuário fizer a partir de agora.
 *  - Mudanças do usuário ficam numa fila persistida (sobrevive a fechar o app / ficar offline)
 *    e são enviadas com novas tentativas. Se o servidor RECUSAR, a mudança é desfeita no app.
 *  - Contas POP3 não são afetadas.
 */

const PENDING_KEY = 'anectta_imap_pending_server_actions';
const RETRY_INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 700;

interface PendingState {
  /** IDs de e-mails com mudança de pasta a refletir no servidor. */
  moves: string[];
  /** IDs de e-mails com mudança de lido/estrela a refletir no servidor. */
  flags: string[];
  /** Exclusões definitivas (o e-mail já saiu do app; guardamos a localização no servidor). */
  deletes: Array<{ ref: string; accountId: string; folderKey: string; uid: number }>;
}

const loadPending = (): PendingState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    return {
      moves: Array.isArray(parsed?.moves) ? parsed.moves : [],
      flags: Array.isArray(parsed?.flags) ? parsed.flags : [],
      deletes: Array.isArray(parsed?.deletes) ? parsed.deletes : [],
    };
  } catch {
    return { moves: [], flags: [], deletes: [] };
  }
};

const savePending = (p: PendingState) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {}
};

export interface ImapServerSyncOptions {
  emails: EmailItem[];
  setEmails: React.Dispatch<React.SetStateAction<EmailItem[]>>;
  accounts: AccountSettings[];
  customFolders: CustomFolder[];
  /** Monta a configuração IMAP da conta (com token OAuth atualizado). null = conta não é IMAP. */
  getImapConfig: (account: AccountSettings) => Promise<any | null>;
  showToast: (msg: string) => void;
  /** Pede uma sincronização em segundo plano (usado quando o servidor não informa o novo UID). */
  requestBackgroundSync: () => void;
}

export function useImapServerSync(opts: ImapServerSyncOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const pendingRef = useRef<PendingState>(loadPending());
  const baselineFolderRef = useRef(new Map<string, MailFolder>());
  const baselineFlagsRef = useRef(new Map<string, { isRead: boolean; isStarred: boolean }>());
  const inFlightRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFlushRef = useRef<() => void>(() => {});

  const persist = () => savePending(pendingRef.current);

  const imapAccountIds = useCallback((): Set<string> => {
    const ids = new Set<string>();
    for (const acc of optsRef.current.accounts) {
      if ((acc.incomingServer?.protocol || 'imap').toLowerCase() === 'imap') ids.add(acc.id);
    }
    return ids;
  }, []);

  /** Pasta do servidor correspondente à pasta local (null = pasta só do app, ex.: Adiados, Favoritos). */
  const serverKeyForLocalFolder = useCallback((folder: MailFolder, accountId: string): string | null => {
    if (SERVER_SYSTEM_FOLDERS.has(folder)) return folder;
    const cf = optsRef.current.customFolders.find((f) => f.id === folder && f.accountId === accountId);
    if (cf?.imapPath) return `imap:${cf.imapPath}`;
    return null;
  }, []);

  /** Pasta local correspondente à pasta do servidor (para desfazer uma mudança recusada). */
  const localFolderForServerKey = useCallback((folderKey: string, accountId: string): MailFolder | null => {
    if (SERVER_SYSTEM_FOLDERS.has(folderKey)) return folderKey as MailFolder;
    if (folderKey.startsWith('imap:')) {
      const path = folderKey.slice(5);
      const cf = optsRef.current.customFolders.find((f) => f.accountId === accountId && f.imapPath === path);
      if (cf) return cf.id as MailFolder;
    }
    return null;
  }, []);

  /** Registra como linha de base o estado vindo do servidor (evita reenviar o que veio dele). */
  const acknowledgeServerFlags = useCallback((updates: Array<{ id: string; isRead: boolean; isStarred: boolean }>) => {
    for (const u of updates) {
      baselineFlagsRef.current.set(u.id, { isRead: u.isRead, isStarred: u.isStarred });
    }
  }, []);

  /** Exclusão definitiva no app → exclusão no servidor (chamar ANTES de remover os e-mails). */
  const queueServerDeletes = useCallback((emailsToDelete: EmailItem[]) => {
    const imapIds = imapAccountIds();
    let added = 0;
    for (const e of emailsToDelete) {
      if (!e.accountId || !imapIds.has(e.accountId)) continue;
      const loc = getImapLocation(e);
      if (!loc) continue;
      pendingRef.current.deletes.push({ ref: e.id, accountId: e.accountId, folderKey: loc.folderKey, uid: loc.uid });
      pendingRef.current.moves = pendingRef.current.moves.filter((id) => id !== e.id);
      pendingRef.current.flags = pendingRef.current.flags.filter((id) => id !== e.id);
      added++;
    }
    if (added > 0) {
      persist();
      scheduleFlushRef.current();
    }
  }, [imapAccountIds]);

  const flush = useCallback(async () => {
    if (inFlightRef.current) return;
    const api = window.electronAPI?.applyImapServerActions;
    if (!api) return;
    const pending = pendingRef.current;
    if (pending.moves.length === 0 && pending.flags.length === 0 && pending.deletes.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    inFlightRef.current = true;
    const attempted = new Set<string>([
      ...pending.moves,
      ...pending.flags,
      ...pending.deletes.map((d) => `delete:${d.ref}:${d.folderKey}:${d.uid}`),
    ]);
    try {
      const { emails, accounts } = optsRef.current;
      const byId = new Map(emails.map((e) => [e.id, e]));
      const imapIds = imapAccountIds();

      type Action = {
        ref: string;
        kind: 'move' | 'flags' | 'delete';
        folderKey: string;
        uid: number;
        toFolderKey?: string;
        seen?: boolean;
        flagged?: boolean;
      };
      const actionsByAccount = new Map<string, Action[]>();
      const push = (accountId: string, a: Action) => {
        const list = actionsByAccount.get(accountId) || [];
        list.push(a);
        actionsByAccount.set(accountId, list);
      };
      const meta = new Map<string, { kind: Action['kind']; emailId?: string; loc: ImapLocation; accountId: string; flags?: { isRead: boolean; isStarred: boolean } }>();

      // Lido / estrela
      for (const id of [...pending.flags]) {
        const e = byId.get(id);
        const loc = e ? getImapLocation(e) : null;
        if (!e || !e.accountId || !imapIds.has(e.accountId) || !loc) {
          pending.flags = pending.flags.filter((x) => x !== id);
          continue;
        }
        const ref = `flags:${id}`;
        const desired = { isRead: Boolean(e.isRead), isStarred: Boolean(e.isStarred) };
        push(e.accountId, { ref, kind: 'flags', folderKey: loc.folderKey, uid: loc.uid, seen: desired.isRead, flagged: desired.isStarred });
        meta.set(ref, { kind: 'flags', emailId: id, loc, accountId: e.accountId, flags: desired });
      }

      // Mover
      for (const id of [...pending.moves]) {
        const e = byId.get(id);
        const loc = e ? getImapLocation(e) : null;
        if (!e || !e.accountId || !imapIds.has(e.accountId) || !loc) {
          pending.moves = pending.moves.filter((x) => x !== id);
          continue;
        }
        const target = serverKeyForLocalFolder(e.folder, e.accountId);
        if (!target || target === loc.folderKey) {
          pending.moves = pending.moves.filter((x) => x !== id);
          continue;
        }
        const ref = `move:${id}`;
        push(e.accountId, { ref, kind: 'move', folderKey: loc.folderKey, uid: loc.uid, toFolderKey: target });
        meta.set(ref, { kind: 'move', emailId: id, loc, accountId: e.accountId });
      }

      // Excluir definitivamente
      for (const d of pending.deletes) {
        if (!imapIds.has(d.accountId)) continue;
        const ref = `delete:${d.ref}:${d.folderKey}:${d.uid}`;
        push(d.accountId, { ref, kind: 'delete', folderKey: d.folderKey, uid: d.uid });
        meta.set(ref, { kind: 'delete', loc: { folderKey: d.folderKey, uid: d.uid }, accountId: d.accountId });
      }
      persist();

      const locationUpdates = new Map<string, ImapLocation>();
      const removeLocal = new Set<string>();
      const revertFolder = new Map<string, MailFolder>();
      const revertFlags = new Map<string, { isRead: boolean; isStarred: boolean }>();
      const refusals: string[] = [];
      let needsSync = false;

      for (const [accountId, actions] of actionsByAccount) {
        const account = accounts.find((a) => a.id === accountId);
        if (!account) continue;
        const config = await optsRef.current.getImapConfig(account);
        if (!config) continue;
        let response: { results?: Array<{ ref: string; ok: boolean; retry?: boolean; error?: string; newLocation?: ImapLocation }> };
        try {
          response = await api(config, actions);
        } catch {
          continue; // falha de IPC/rede: tenta de novo depois
        }
        // Estado mais recente (o usuário pode ter mudado o mesmo e-mail durante o envio)
        const latestById = new Map(optsRef.current.emails.map((e) => [e.id, e]));
        for (const r of response.results || []) {
          const m = meta.get(r.ref);
          if (!m) continue;
          if (r.ok) {
            if (m.kind === 'flags' && m.emailId) {
              if (m.flags) baselineFlagsRef.current.set(m.emailId, m.flags);
              const latest = latestById.get(m.emailId);
              const changedAgain =
                latest &&
                m.flags &&
                (Boolean(latest.isRead) !== m.flags.isRead || Boolean(latest.isStarred) !== m.flags.isStarred);
              if (!changedAgain) pending.flags = pending.flags.filter((x) => x !== m.emailId);
            } else if (m.kind === 'move' && m.emailId) {
              const latest = latestById.get(m.emailId);
              const movedAgain =
                latest && r.newLocation && serverKeyForLocalFolder(latest.folder, m.accountId) !== r.newLocation.folderKey;
              if (!movedAgain) pending.moves = pending.moves.filter((x) => x !== m.emailId);
              if (r.newLocation) {
                locationUpdates.set(m.emailId, r.newLocation);
              } else {
                // Servidor não informou o novo UID: a cópia local sai e volta pela sincronização
                removeLocal.add(m.emailId);
                needsSync = true;
              }
            } else if (m.kind === 'delete') {
              pending.deletes = pending.deletes.filter(
                (d) => `delete:${d.ref}:${d.folderKey}:${d.uid}` !== r.ref
              );
            }
          } else if (!r.retry) {
            // Servidor RECUSOU: desfaz no app e avisa
            refusals.push(r.error || 'ação recusada pelo servidor');
            if (m.kind === 'flags' && m.emailId) {
              pending.flags = pending.flags.filter((x) => x !== m.emailId);
              const base = baselineFlagsRef.current.get(m.emailId);
              if (base) revertFlags.set(m.emailId, base);
            } else if (m.kind === 'move' && m.emailId) {
              pending.moves = pending.moves.filter((x) => x !== m.emailId);
              const back = localFolderForServerKey(m.loc.folderKey, m.accountId);
              if (back) revertFolder.set(m.emailId, back);
            } else if (m.kind === 'delete') {
              pending.deletes = pending.deletes.filter(
                (d) => `delete:${d.ref}:${d.folderKey}:${d.uid}` !== r.ref
              );
            }
          }
          // r.retry: mantém na fila para a próxima tentativa
        }
      }
      persist();

      if (locationUpdates.size > 0 || removeLocal.size > 0 || revertFolder.size > 0 || revertFlags.size > 0) {
        for (const [id, folder] of revertFolder) baselineFolderRef.current.set(id, folder);
        for (const id of removeLocal) baselineFolderRef.current.delete(id);
        optsRef.current.setEmails((prev) =>
          prev
            .filter((e) => !removeLocal.has(e.id))
            .map((e) => {
              let next = e;
              const loc = locationUpdates.get(e.id);
              if (loc) next = { ...next, imapLocation: loc };
              const folder = revertFolder.get(e.id);
              if (folder) next = { ...next, folder };
              const flags = revertFlags.get(e.id);
              if (flags) next = { ...next, isRead: flags.isRead, isStarred: flags.isStarred };
              return next;
            })
        );
      }
      if (refusals.length > 0) {
        optsRef.current.showToast(
          `⚠️ O servidor recusou ${refusals.length} ação(ões); a alteração foi desfeita no app. (${refusals[0]})`
        );
      }
      if (needsSync) optsRef.current.requestBackgroundSync();
    } finally {
      inFlightRef.current = false;
      // Ações feitas pelo usuário enquanto este envio estava em andamento: envia em seguida
      const p = pendingRef.current;
      const hasNew =
        p.moves.some((id) => !attempted.has(id)) ||
        p.flags.some((id) => !attempted.has(id)) ||
        p.deletes.some((d) => !attempted.has(`delete:${d.ref}:${d.folderKey}:${d.uid}`));
      if (hasNew) scheduleFlushRef.current();
    }
  }, [imapAccountIds, serverKeyForLocalFolder, localFolderForServerKey]);

  const scheduleFlush = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void flush();
    }, DEBOUNCE_MS);
  }, [flush]);
  scheduleFlushRef.current = scheduleFlush;

  // Detecta as mudanças do usuário comparando com a linha de base da sessão
  useEffect(() => {
    const imapIds = imapAccountIds();
    if (imapIds.size === 0) return;
    const pending = pendingRef.current;
    const pendingMoves = new Set(pending.moves);
    const pendingFlags = new Set(pending.flags);
    let changed = false;

    for (const e of opts.emails) {
      if (!e.accountId || !imapIds.has(e.accountId)) continue;
      if (!getImapLocation(e)) continue;

      const baseFolder = baselineFolderRef.current.get(e.id);
      if (baseFolder === undefined) {
        baselineFolderRef.current.set(e.id, e.folder);
      } else if (baseFolder !== e.folder) {
        baselineFolderRef.current.set(e.id, e.folder);
        if (!pendingMoves.has(e.id)) {
          pendingMoves.add(e.id);
          changed = true;
        }
      }

      const current = { isRead: Boolean(e.isRead), isStarred: Boolean(e.isStarred) };
      const baseFlags = baselineFlagsRef.current.get(e.id);
      if (!baseFlags) {
        baselineFlagsRef.current.set(e.id, current);
      } else if (baseFlags.isRead !== current.isRead || baseFlags.isStarred !== current.isStarred) {
        if (!pendingFlags.has(e.id)) {
          pendingFlags.add(e.id);
          changed = true;
        }
      }
    }

    if (changed) {
      pending.moves = Array.from(pendingMoves);
      pending.flags = Array.from(pendingFlags);
      persist();
      scheduleFlush();
    }
  }, [opts.emails, imapAccountIds, scheduleFlush]);

  // Fila pendente de sessões anteriores, novas tentativas periódicas e ao voltar a conexão
  useEffect(() => {
    const first = setTimeout(() => void flush(), 15_000);
    const timer = setInterval(() => void flush(), RETRY_INTERVAL_MS);
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flush]);

  return { queueServerDeletes, acknowledgeServerFlags };
}
