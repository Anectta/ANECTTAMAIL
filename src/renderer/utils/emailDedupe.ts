import type { EmailItem } from '@/types/email';
import { imapServerKey, parseImapLocationFromId } from './imapLocation';

/**
 * Duplicados de uma mesma mensagem do servidor IMAP no app.
 *
 *  1. Por localização: um e-mail do app que aponta para "<conta>-imap-<pasta>-<uid>" (porque foi
 *     movido pelo app ou é a cópia local de um enviado) e, ao mesmo tempo, uma cópia baixada com
 *     exatamente esse id. Fica o e-mail do app (tem o histórico local); a cópia baixada sai.
 *  2. Enviados pelo Message-ID: a cópia local de um e-mail enviado e a cópia baixada do servidor.
 *     Fica a local, que passa a apontar para a do servidor.
 *
 * Remover do app NÃO apaga nada no servidor (é a mesma mensagem lá).
 */
export function removeServerDuplicates(list: EmailItem[]): {
  emails: EmailItem[];
  removedIds: string[];
  /** E-mails locais que passaram a apontar para a cópia do servidor (gravar no banco). */
  linked: EmailItem[];
} {
  const byId = new Map(list.map((e) => [e.id, e]));
  const remove = new Set<string>();
  const linkedMap = new Map<string, EmailItem>();

  // 1. Por localização
  for (const e of list) {
    const loc = e.imapLocation;
    if (!loc || !e.accountId) continue;
    const sid = imapServerKey(e.accountId, loc);
    if (sid !== e.id && byId.has(sid) && !remove.has(e.id)) remove.add(sid);
  }

  // 2. Enviados com o mesmo Message-ID (cópia local + cópia do servidor)
  const groups = new Map<string, EmailItem[]>();
  for (const e of list) {
    if (e.folder !== 'sent' || !e.messageIdHeader || !e.accountId || remove.has(e.id)) continue;
    const key = `${e.accountId}|${e.messageIdHeader.trim()}`;
    const g = groups.get(key) || [];
    g.push(e);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const local = g.find((e) => !parseImapLocationFromId(e.id, e.accountId));
    const servers = g.filter((e) => parseImapLocationFromId(e.id, e.accountId));
    // Só quando há exatamente uma cópia do servidor: a local passa a apontar para ela, e nada
    // fica "desconhecido" (senão o download automático baixaria de novo a cópia removida)
    if (local && servers.length === 1) {
      const serverLoc = parseImapLocationFromId(servers[0].id, servers[0].accountId)!;
      const sameAsLocal =
        local.imapLocation &&
        local.imapLocation.folderKey === serverLoc.folderKey &&
        local.imapLocation.uid === serverLoc.uid;
      if (!local.imapLocation) linkedMap.set(local.id, { ...local, imapLocation: serverLoc });
      if (!local.imapLocation || sameAsLocal) remove.add(servers[0].id);
    }
  }

  if (remove.size === 0 && linkedMap.size === 0) return { emails: list, removedIds: [], linked: [] };
  const emails = list.filter((e) => !remove.has(e.id)).map((e) => linkedMap.get(e.id) || e);
  return { emails, removedIds: Array.from(remove), linked: Array.from(linkedMap.values()) };
}
