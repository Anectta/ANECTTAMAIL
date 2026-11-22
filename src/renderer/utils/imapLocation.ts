import type { EmailItem } from '@/types/email';

/**
 * Localização de uma mensagem no servidor IMAP.
 * folderKey: 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'imap:<caminho>'
 */
export interface ImapLocation {
  folderKey: string;
  uid: number;
}

export const SERVER_SYSTEM_FOLDERS = new Set(['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive']);

/** Extrai a localização do id "<contaId>-imap-<pasta>-<uid>" (formato dos e-mails baixados do servidor). */
export function parseImapLocationFromId(id: string, accountId?: string): ImapLocation | null {
  if (!id || !accountId) return null;
  const prefix = `${accountId}-imap-`;
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  const lastDash = rest.lastIndexOf('-');
  if (lastDash <= 0) return null;
  const uid = Number(rest.slice(lastDash + 1));
  if (!Number.isFinite(uid)) return null;
  return { folderKey: rest.slice(0, lastDash), uid };
}

/** Onde a mensagem está AGORA no servidor (imapLocation tem prioridade sobre o id). */
export function getImapLocation(email: Pick<EmailItem, 'id' | 'accountId' | 'imapLocation'>): ImapLocation | null {
  if (email.imapLocation && Number.isFinite(email.imapLocation.uid) && email.imapLocation.folderKey) {
    return email.imapLocation;
  }
  return parseImapLocationFromId(email.id, email.accountId);
}

/** Chave usada pelo servidor para a mensagem ("<contaId>-imap-<pasta>-<uid>"). */
export function imapServerKey(accountId: string, loc: ImapLocation): string {
  return `${accountId}-imap-${loc.folderKey}-${loc.uid}`;
}
