import { useCallback, useRef, useState } from 'react';
import type { CustomFolder, EmailItem, MailFolder } from '@/types/email';
import type { AccountSettings } from '@/types/settings';
import { getImapLocation, parseImapLocationFromId } from '../utils/imapLocation';
import { getEmailTimestampMs } from '../utils/dateSortUtils';
import { removeServerDuplicates } from '../utils/emailDedupe';

/**
 * Download completo automático ("backfill").
 *
 * Depois de cada sincronização, baixa em segundo plano TODAS as mensagens que ainda faltam no app,
 * em todas as pastas de todas as contas, das mais novas para as mais antigas, até terminar.
 *  - Não duplica: compara a lista real do servidor (UIDs / UIDL) com o que o app já tem.
 *  - Não traz de volta o que foi excluído definitivamente no app (lista de excluídos).
 *  - Cancelar interrompe só a execução atual: a próxima sincronização retoma de onde parou.
 *  - Pasta em que o app já tem tudo (contagem local ≥ total do servidor) é pulada sem conectar.
 */

const IMAP_BATCH = 100;

// Pastas que o servidor recusa (ex.: pastas-mãe que não podem ser abertas): pausa por um tempo
// em vez de tentar 3 vezes a cada sincronização
const SKIP_KEY = 'anectta_backfill_skip_folders';
const SKIP_MS = 2 * 60 * 60 * 1000;
// Mensagens que o servidor lista mas não entrega: não insiste a cada sincronização
const UNFETCHABLE_KEY = 'anectta_backfill_unfetchable';
const MAX_UNFETCHABLE_PER_FOLDER = 2000;

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const isServerRefusal = (msg?: string) =>
  /command failed|nonexistent|does not exist|doesn't exist|noselect|cannot select|not selectable/i.test(msg || '');
const POP3_BATCH = 200;
const MAX_CONSECUTIVE_ERRORS = 3;

const SYSTEM_FOLDER_LABELS: Record<string, string> = {
  inbox: 'Caixa de Entrada',
  sent: 'Enviados',
  drafts: 'Rascunhos',
  archive: 'Arquivo Morto',
  junk: 'Spam',
  trash: 'Lixeira',
};

export interface BackfillProgress {
  /** Conta e pasta em andamento, ex.: "Caixa de Entrada · ana@empresa.com". */
  label: string;
  /** Mensagens baixadas nesta execução (todas as pastas). */
  downloaded: number;
  /** Total da pasta atual no servidor. */
  total?: number;
  /** Quantas ainda faltam na pasta atual. */
  remaining?: number;
}

export interface MailBackfillOptions {
  accounts: AccountSettings[];
  customFolders: CustomFolder[];
  emailsRef: React.MutableRefObject<EmailItem[]>;
  setEmails: React.Dispatch<React.SetStateAction<EmailItem[]>>;
  serverFolderTotals: Record<string, number>;
  setServerFolderTotals: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  ensureFreshAccessToken: (acc: AccountSettings) => Promise<string | undefined>;
  loadDeletedEmailIds: () => string[];
}

export function useMailBackfill(opts: MailBackfillOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);

  /** Acrescenta mensagens baixadas sem sobrescrever as que o app já tem. */
  const mergeEmails = useCallback((incoming: EmailItem[]) => {
    if (incoming.length === 0) return;
    optsRef.current.setEmails((prev) => {
      const existing = new Set(prev.map((e) => e.id));
      const added = incoming.filter((m) => !existing.has(m.id));
      if (added.length === 0) return prev;
      // Cópia do servidor de um e-mail que o app já tem (ex.: enviado pelo app) não vira duplicado
      const merged = removeServerDuplicates([...prev, ...added]).emails.slice();
      merged.sort((a, b) => getEmailTimestampMs(b) - getEmailTimestampMs(a));
      return merged;
    });
  }, []);

  const backfillImapAccount = useCallback(
    async (acc: AccountSettings, accessToken: string | undefined, counter: { downloaded: number }) => {
      const api = window.electronAPI?.fetchOlderFolderMessages;
      if (!api) return;
      const incoming = acc.incomingServer;
      const config = {
        protocol: 'imap' as const,
        host: incoming.host,
        port: incoming.port || 993,
        secure: incoming.security !== 'none',
        user: incoming.username || acc.email,
        pass: incoming.password || acc.password || '',
        accessToken,
      };

      const custom = optsRef.current.customFolders.filter((f) => f.accountId === acc.id && f.imapPath);
      const folders: Array<{ localId: MailFolder; serverKey: string; label: string; imapPath?: string }> = [
        { localId: 'inbox', serverKey: 'inbox', label: SYSTEM_FOLDER_LABELS.inbox },
        { localId: 'sent', serverKey: 'sent', label: SYSTEM_FOLDER_LABELS.sent },
        ...custom.map((cf) => ({
          localId: cf.id as MailFolder,
          serverKey: `imap:${cf.imapPath}`,
          label: cf.name,
          imapPath: cf.imapPath,
        })),
        ...(['drafts', 'archive', 'junk', 'trash'] as const).map((id) => ({
          localId: id as MailFolder,
          serverKey: id,
          label: SYSTEM_FOLDER_LABELS[id],
        })),
      ];

      const skipMap = readJson<Record<string, number>>(SKIP_KEY, {});
      const unfetchableMap = readJson<Record<string, number[]>>(UNFETCHABLE_KEY, {});

      for (const folder of folders) {
        if (cancelRef.current) return;
        const folderKey = `${acc.id}:${folder.serverKey}`;
        if ((skipMap[folderKey] || 0) > Date.now()) continue;
        const unfetchable = new Set<number>(unfetchableMap[folderKey] || []);

        // UIDs que o app já tem nesta pasta do servidor (+ excluídos definitivamente)
        const localUids = new Set<number>();
        for (const e of optsRef.current.emailsRef.current) {
          if (e.accountId !== acc.id) continue;
          const loc = getImapLocation(e);
          if (loc && loc.folderKey === folder.serverKey) localUids.add(loc.uid);
        }
        const known = new Set<number>([...localUids, ...unfetchable]);
        for (const id of optsRef.current.loadDeletedEmailIds()) {
          const loc = parseImapLocationFromId(id, acc.id);
          if (loc && loc.folderKey === folder.serverKey) known.add(loc.uid);
        }

        // Já tem tudo segundo a última sincronização → não precisa conectar
        const knownTotal = optsRef.current.serverFolderTotals[`${acc.id}:${folder.serverKey}`];
        if (typeof knownTotal === 'number' && localUids.size + unfetchable.size >= knownTotal) continue;

        const label = `${folder.label} · ${acc.email}`;
        let errors = 0;
        while (!cancelRef.current) {
          let res: Awaited<ReturnType<NonNullable<typeof api>>>;
          try {
            res = await api({
              config,
              folder: folder.serverKey,
              batchSize: IMAP_BATCH,
              imapPath: folder.imapPath,
              knownUids: Array.from(known),
              missingOnly: true,
            });
          } catch (err: any) {
            res = { success: false, error: err?.message || 'Falha de comunicação' } as any;
          }

          if (!res.success) {
            if (isServerRefusal(res.error)) {
              // Recusa do servidor: pausa esta pasta por um tempo (sem novas tentativas agora)
              skipMap[folderKey] = Date.now() + SKIP_MS;
              writeJson(SKIP_KEY, skipMap);
              break;
            }
            errors++;
            if (errors >= MAX_CONSECUTIVE_ERRORS) break; // tenta de novo na próxima sincronização
            await new Promise((r) => setTimeout(r, 2000 * errors));
            continue;
          }
          errors = 0;

          if (typeof res.serverTotal === 'number') {
            const total = res.serverTotal;
            optsRef.current.setServerFolderTotals((prev) =>
              prev[`${acc.id}:${folder.serverKey}`] === total && prev[`${acc.id}:${folder.localId}`] === total
                ? prev
                : { ...prev, [`${acc.id}:${folder.serverKey}`]: total, [`${acc.id}:${folder.localId}`]: total }
            );
          }

          for (const uid of res.attemptedUids || []) known.add(uid);
          // Pedidos que não voltaram: o servidor lista mas não entrega — não insistir depois
          const returned = new Set<number>(
            (res.emails || []).map((m: any) => Number(String(m.id).split('-').pop())).filter(Number.isFinite)
          );
          const notReturned = (res.attemptedUids || []).filter((uid: number) => !returned.has(uid));
          if (notReturned.length > 0) {
            for (const uid of notReturned) unfetchable.add(uid);
            unfetchableMap[folderKey] = Array.from(unfetchable).slice(-MAX_UNFETCHABLE_PER_FOLDER);
            writeJson(UNFETCHABLE_KEY, unfetchableMap);
          }
          const batch = (res.emails || []).map((m: any) => ({
            ...m,
            id: m.id.startsWith(`${acc.id}-`) ? m.id : `${acc.id}-${m.id}`,
            accountId: acc.id,
            folder: folder.localId,
          })) as EmailItem[];
          counter.downloaded += batch.length;
          mergeEmails(batch);

          // O aviso só aparece quando realmente há mensagens sendo baixadas
          if (batch.length > 0) {
            setProgress({
              label,
              downloaded: counter.downloaded,
              total: res.serverTotal,
              remaining: res.remaining,
            });
          }

          if (!res.hasMore || (res.attemptedUids?.length ?? 0) === 0) break;
        }
      }
    },
    [mergeEmails]
  );

  const backfillPop3Account = useCallback(
    async (acc: AccountSettings, accessToken: string | undefined, counter: { downloaded: number }) => {
      const api = window.electronAPI?.fetchRealInbox;
      if (!api) return;
      const incoming = acc.incomingServer;
      const prefix = `${acc.id}-`;
      const strip = (id: string) => (id.startsWith(prefix) ? id.slice(prefix.length) : id);

      const localIds = optsRef.current.emailsRef.current
        .filter((e) => e.accountId === acc.id && e.id.includes('pop3-'))
        .map((e) => strip(e.id));
      const knownTotal = optsRef.current.serverFolderTotals[`${acc.id}:inbox`];
      if (typeof knownTotal === 'number' && localIds.length >= knownTotal) return;

      const known = new Set<string>([
        ...localIds,
        ...optsRef.current
          .loadDeletedEmailIds()
          .filter((id) => id.startsWith(prefix) && id.includes('pop3-'))
          .map(strip),
      ]);
      const label = `${SYSTEM_FOLDER_LABELS.inbox} · ${acc.email}`;
      let errors = 0;

      while (!cancelRef.current) {
        let res: any;
        try {
          res = await api({
            protocol: 'pop3',
            host: incoming.host,
            port: incoming.port || 995,
            secure: incoming.security !== 'none',
            user: incoming.username || acc.email,
            pass: incoming.password || acc.password || '',
            accessToken,
            leaveOnServer: incoming.leaveOnServer ?? true,
            knownPop3Ids: Array.from(known),
            pop3BatchLimit: POP3_BATCH,
          });
        } catch (err: any) {
          res = { success: false, error: err?.message };
        }
        if (!res?.success) {
          errors++;
          if (errors >= MAX_CONSECUTIVE_ERRORS) break;
          await new Promise((r) => setTimeout(r, 2000 * errors));
          continue;
        }
        errors = 0;
        if (typeof res.serverTotal === 'number') {
          const total = res.serverTotal;
          optsRef.current.setServerFolderTotals((prev) =>
            prev[`${acc.id}:inbox`] === total ? prev : { ...prev, [`${acc.id}:inbox`]: total }
          );
        }
        const emails: any[] = res.emails || [];
        if (emails.length === 0) break;
        for (const m of emails) known.add(strip(m.id));
        const batch = emails.map((m) => ({
          ...m,
          id: m.id.startsWith(prefix) ? m.id : `${prefix}${m.id}`,
          accountId: acc.id,
        })) as EmailItem[];
        counter.downloaded += batch.length;
        mergeEmails(batch);
        setProgress({
          label,
          downloaded: counter.downloaded,
          total: res.serverTotal,
          remaining: typeof res.serverTotal === 'number' ? Math.max(0, res.serverTotal - known.size) : undefined,
        });
        if (!res.hasMore) break;
      }
    },
    [mergeEmails]
  );

  /** Inicia (ou retoma) o download completo. Ignorado se já estiver em andamento. */
  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    runningRef.current = true;
    cancelRef.current = false;
    const counter = { downloaded: 0 };
    setIsRunning(true);
    try {
      for (const acc of optsRef.current.accounts) {
        if (cancelRef.current) break;
        const incoming = acc.incomingServer;
        const host = incoming?.host?.trim();
        const user = incoming?.username || acc.email;
        const password = incoming?.password || acc.password || '';
        if (!host || !user) continue;
        let accessToken: string | undefined;
        try {
          accessToken = await optsRef.current.ensureFreshAccessToken(acc);
        } catch {
          continue;
        }
        if (!password && !accessToken) continue;
        const protocol = (incoming.protocol || 'imap').toLowerCase();
        if (protocol === 'pop3') await backfillPop3Account(acc, accessToken, counter);
        else await backfillImapAccount(acc, accessToken, counter);
      }
    } finally {
      setIsRunning(false);
      runningRef.current = false;
      cancelRef.current = false;
      setIsCancelling(false);
      setProgress(null);
    }
  }, [backfillImapAccount, backfillPop3Account]);

  /** Interrompe a execução atual (os e-mails já baixados ficam). A próxima sincronização retoma. */
  const cancel = useCallback(() => {
    if (!runningRef.current) return;
    cancelRef.current = true;
    setIsCancelling(true);
  }, []);

  // O aviso aparece só quando há progresso real (não pisca a cada sincronização sem pendências)
  return { start, cancel, isRunning: isRunning && progress !== null, isCancelling, progress };
}
