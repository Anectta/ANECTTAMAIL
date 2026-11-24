import type { EmailItem } from '@/types/email';

/**
 * E-mails importados de outro programa (.pst/.mbox/.eml) × os que chegam do servidor.
 * A mesma mensagem é reconhecida pelo Message-ID.
 *
 *  - POP3: a mensagem já importada não é baixada de novo (fica a importada).
 *  - IMAP: a cópia do servidor substitui a importada (a do servidor sincroniza com o webmail).
 */
export const normalizeMessageId = (id?: string | null): string =>
  String(id || '')
    .trim()
    .replace(/^<+|>+$/g, '')
    .toLowerCase();

const importedIdsOf = (list: EmailItem[], accountId: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const e of list) {
    if (e.accountId !== accountId || !e.importedFrom) continue;
    const key = normalizeMessageId(e.messageIdHeader);
    if (key) map.set(key, e.id);
  }
  return map;
};

/** POP3: tira do lote recebido o que já existe importado (devolve os ids descartados). */
export function dropPop3AlreadyImported(
  incoming: EmailItem[],
  existing: EmailItem[],
  accountId: string
): { kept: EmailItem[]; dropped: EmailItem[] } {
  const imported = importedIdsOf(existing, accountId);
  if (imported.size === 0) return { kept: incoming, dropped: [] };
  const kept: EmailItem[] = [];
  const dropped: EmailItem[] = [];
  for (const m of incoming) {
    const key = normalizeMessageId(m.messageIdHeader);
    if (key && imported.has(key)) dropped.push(m);
    else kept.push(m);
  }
  return { kept, dropped };
}

/** IMAP: remove as cópias importadas que chegaram agora do servidor. */
export function replaceImportedWithServerCopies(
  prev: EmailItem[],
  incoming: EmailItem[],
  accountId: string
): { prev: EmailItem[]; removedIds: string[] } {
  const imported = importedIdsOf(prev, accountId);
  if (imported.size === 0) return { prev, removedIds: [] };
  const remove = new Set<string>();
  for (const m of incoming) {
    if (m.accountId && m.accountId !== accountId) continue;
    const key = normalizeMessageId(m.messageIdHeader);
    const localId = key ? imported.get(key) : undefined;
    if (localId && localId !== m.id) remove.add(localId);
  }
  if (remove.size === 0) return { prev, removedIds: [] };
  return { prev: prev.filter((e) => !remove.has(e.id)), removedIds: Array.from(remove) };
}
