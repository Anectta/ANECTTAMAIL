import type { CustomFolder } from '@/types/email';

/**
 * Pastas do app que foram apagadas no servidor (webmail, celular, outro programa).
 *
 * Considera só pastas que vieram do servidor (têm imapPath) e da própria conta, e inclui as
 * subpastas delas no app. Trava de segurança: se a lista do servidor parecer incompleta (sem
 * Caixa de Entrada) ou se "sumirem" muitas pastas de uma vez, não remove nada.
 */
export const MAX_FOLDERS_REMOVED_AT_ONCE = 10;

export function findFoldersDeletedOnServer(
  customFolders: CustomFolder[],
  accountId: string,
  serverFolderPaths: string[] | undefined
): { ids: Set<string>; blocked: boolean } {
  const empty = { ids: new Set<string>(), blocked: false };
  if (!Array.isArray(serverFolderPaths) || serverFolderPaths.length === 0) return empty;
  // Lista sem a Caixa de Entrada não é confiável
  if (!serverFolderPaths.some((p) => p.toUpperCase() === 'INBOX')) return { ids: new Set(), blocked: true };

  const onServer = new Set(serverFolderPaths);
  const accountFolders = customFolders.filter((f) => f.accountId === accountId);
  const gone = accountFolders.filter((f) => f.imapPath && !onServer.has(f.imapPath));
  if (gone.length === 0) return empty;

  const serverBacked = accountFolders.filter((f) => f.imapPath).length;
  if (gone.length > MAX_FOLDERS_REMOVED_AT_ONCE && gone.length > serverBacked / 2) {
    return { ids: new Set(), blocked: true };
  }

  // Inclui as subpastas (no app) das pastas apagadas
  const ids = new Set(gone.map((f) => f.id));
  let added = true;
  while (added) {
    added = false;
    for (const f of accountFolders) {
      if (f.parentFolder && ids.has(f.parentFolder) && !ids.has(f.id)) {
        ids.add(f.id);
        added = true;
      }
    }
  }
  return { ids, blocked: false };
}
