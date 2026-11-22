import type { EmailItem, MailFolder } from '@/types/email';
import { getEmailTimestampMs } from './dateSortUtils';

/** Critérios de ordenação da lista de e-mails. */
export type EmailSortField =
  | 'received'
  | 'sent'
  | 'contact'
  | 'from'
  | 'to'
  | 'cc'
  | 'subject'
  | 'size'
  | 'unread'
  | 'starred'
  | 'attachments';

export type EmailSortDirection = 'desc' | 'asc';

export interface EmailSortFieldInfo {
  id: EmailSortField;
  label: string;
  /** Rótulos da direção: [desc, asc]. */
  directions: [string, string];
  /** Direção aplicada ao escolher o critério. */
  defaultDirection: EmailSortDirection;
  /** Separador visual antes deste item no menu. */
  separatorBefore?: boolean;
}

export const EMAIL_SORT_FIELDS: EmailSortFieldInfo[] = [
  { id: 'received', label: 'Data de recebimento', directions: ['Mais recentes primeiro', 'Mais antigos primeiro'], defaultDirection: 'desc' },
  { id: 'sent', label: 'Data de envio', directions: ['Mais recentes primeiro', 'Mais antigos primeiro'], defaultDirection: 'desc' },
  { id: 'contact', label: 'Contato (De ou Para)', directions: ['Z → A', 'A → Z'], defaultDirection: 'asc', separatorBefore: true },
  { id: 'from', label: 'Remetente (De)', directions: ['Z → A', 'A → Z'], defaultDirection: 'asc' },
  { id: 'to', label: 'Destinatário (Para)', directions: ['Z → A', 'A → Z'], defaultDirection: 'asc' },
  { id: 'cc', label: 'Com cópia (Cc)', directions: ['Z → A', 'A → Z'], defaultDirection: 'asc' },
  { id: 'subject', label: 'Assunto', directions: ['Z → A', 'A → Z'], defaultDirection: 'asc' },
  { id: 'size', label: 'Tamanho', directions: ['Maiores primeiro', 'Menores primeiro'], defaultDirection: 'desc', separatorBefore: true },
  { id: 'unread', label: 'Não lidos', directions: ['Não lidos primeiro', 'Lidos primeiro'], defaultDirection: 'desc' },
  { id: 'starred', label: 'Favoritos', directions: ['Favoritos primeiro', 'Sem estrela primeiro'], defaultDirection: 'desc' },
  { id: 'attachments', label: 'Anexos', directions: ['Com anexos primeiro', 'Sem anexos primeiro'], defaultDirection: 'desc' },
];

export const isDateSortField = (f: EmailSortField): boolean => f === 'received' || f === 'sent';

export const getSortFieldInfo = (f: EmailSortField): EmailSortFieldInfo =>
  EMAIL_SORT_FIELDS.find((x) => x.id === f) || EMAIL_SORT_FIELDS[0];

const OUTGOING_FOLDERS = new Set<MailFolder>(['sent', 'drafts', 'outbox']);

/** Data de envio (cabeçalho Date). */
export const getSentMs = (e: EmailItem): number => getEmailTimestampMs(e);

/** Data de recebimento no servidor; e-mails antigos sem essa informação usam a data de envio. */
export const getReceivedMs = (e: EmailItem): number => {
  if (e.receivedDateStr) {
    const t = new Date(e.receivedDateStr).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return getEmailTimestampMs(e);
};

/** Tamanho em bytes; sem a informação do servidor, estima pelo conteúdo e anexos. */
export const getSizeBytes = (e: EmailItem): number => {
  if (typeof e.sizeBytes === 'number' && e.sizeBytes > 0) return e.sizeBytes;
  const attachments = (e.attachments || []).reduce((sum, a) => sum + (a.size || 0), 0);
  return (e.body?.length || 0) + (e.bodyHtml?.length || 0) + attachments;
};

/** Primeiro nome de uma lista de endereços ("Ana <a@x>, Bia <b@y>" → "Ana"). */
const firstAddressName = (raw?: string): string => {
  if (!raw) return '';
  const first = raw.split(/[,;]/)[0].trim();
  const named = first.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  if (named) return named[1].trim();
  return first.replace(/[<>]/g, '').trim();
};

export const getContactName = (e: EmailItem, field: EmailSortField): string => {
  switch (field) {
    case 'from':
      return (e.sender || e.senderEmail || '').trim();
    case 'to':
      return firstAddressName(e.recipient);
    case 'cc':
      return firstAddressName(e.cc);
    case 'contact':
      return OUTGOING_FOLDERS.has(e.folder) ? firstAddressName(e.recipient) : (e.sender || e.senderEmail || '').trim();
    default:
      return '';
  }
};

const normalizeSubject = (s: string): string =>
  (s || '').replace(/^\s*((re|res|fw|fwd|enc|tr)\s*:\s*)+/i, '').trim();

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const SIZE_BUCKETS: Array<{ id: string; label: string; min: number }> = [
  { id: 'huge', label: 'Enormes (acima de 5 MB)', min: 5 * 1024 * 1024 },
  { id: 'large', label: 'Grandes (1 a 5 MB)', min: 1024 * 1024 },
  { id: 'medium', label: 'Médios (100 KB a 1 MB)', min: 100 * 1024 },
  { id: 'small', label: 'Pequenos (até 100 KB)', min: 0 },
];

export interface SortGroupKey {
  id: string;
  label: string;
  /** Chave de ordenação do grupo (texto ou número). */
  sortKey: string | number;
}

/** Grupo em que o e-mail aparece para critérios que não são data. */
export function getSortGroup(e: EmailItem, field: EmailSortField, hasAttachment: boolean, isUnread: boolean, isStarred: boolean): SortGroupKey {
  switch (field) {
    case 'contact':
    case 'from':
    case 'to':
    case 'cc': {
      const name = getContactName(e, field);
      if (!name) {
        const empty = field === 'cc' ? '(sem cópia)' : '(sem nome)';
        return { id: `${field}:`, label: empty, sortKey: '￿' };
      }
      return { id: `${field}:${name.toLowerCase()}`, label: name, sortKey: name };
    }
    case 'subject': {
      const subj = normalizeSubject(e.subject);
      const letter = subj.charAt(0).toLocaleUpperCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
      const key = /[A-Z]/.test(letter) ? letter : '#';
      return { id: `subject:${key}`, label: key === '#' ? '# (números e símbolos)' : key, sortKey: key === '#' ? ' ' : key };
    }
    case 'size': {
      const bytes = getSizeBytes(e);
      const idx = SIZE_BUCKETS.findIndex((b) => bytes >= b.min);
      const b = SIZE_BUCKETS[idx < 0 ? SIZE_BUCKETS.length - 1 : idx];
      return { id: `size:${b.id}`, label: b.label, sortKey: b.min };
    }
    case 'unread':
      return isUnread ? { id: 'unread:1', label: 'Não lidos', sortKey: 1 } : { id: 'unread:0', label: 'Lidos', sortKey: 0 };
    case 'starred':
      return isStarred ? { id: 'starred:1', label: 'Favoritos', sortKey: 1 } : { id: 'starred:0', label: 'Sem estrela', sortKey: 0 };
    case 'attachments':
      return hasAttachment
        ? { id: 'att:1', label: 'Com anexos', sortKey: 1 }
        : { id: 'att:0', label: 'Sem anexos', sortKey: 0 };
    default:
      return { id: 'all', label: 'Todos', sortKey: 0 };
  }
}

/**
 * Compara duas chaves de grupo. Números: desc = maior primeiro.
 * Textos: asc = A → Z. "(sem nome)" fica sempre por último.
 */
export function compareGroupKeys(a: string | number, b: string | number, direction: EmailSortDirection): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'desc' ? b - a : a - b;
  }
  const sa = String(a);
  const sb = String(b);
  if (sa === '￿' || sb === '￿') return sa === sb ? 0 : sa === '￿' ? 1 : -1;
  const c = collator.compare(sa, sb);
  return direction === 'asc' ? c : -c;
}

/** Ordem dentro de um grupo não-data: tamanho exato ou assunto, depois mais recentes primeiro. */
export function compareWithinGroup(
  a: { email: EmailItem; ts: number },
  b: { email: EmailItem; ts: number },
  field: EmailSortField,
  direction: EmailSortDirection
): number {
  if (field === 'size') {
    const d = getSizeBytes(a.email) - getSizeBytes(b.email);
    if (d !== 0) return direction === 'desc' ? -d : d;
  } else if (field === 'subject') {
    const c = collator.compare(normalizeSubject(a.email.subject), normalizeSubject(b.email.subject));
    if (c !== 0) return direction === 'asc' ? c : -c;
  }
  return b.ts - a.ts;
}

export const SORT_FIELD_STORAGE_KEY = 'anectta_email_sort_field';

export const loadSortField = (): EmailSortField => {
  try {
    const saved = localStorage.getItem(SORT_FIELD_STORAGE_KEY) as EmailSortField | null;
    if (saved && EMAIL_SORT_FIELDS.some((f) => f.id === saved)) return saved;
  } catch {}
  return 'received';
};
