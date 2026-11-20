import { EmailItem } from '@/types/email';
import { getEmailTimestampMs } from './dateSortUtils';
import { filterRealAttachments } from './attachmentUtils';

export interface EmailThread {
  threadId: string;
  messages: EmailItem[];
  latestEmail: EmailItem;
  count: number;
  unreadCount: number;
  hasUnread: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  participants: string[];
  latestTimestampMs: number;
}

const REPLY_FORWARD_PREFIX_RE = /^(?:(?:re|res|resp|fwd|fw|enc|aw|sv|rv)(?:\[\d+\])?:\s*)+/i;

/**
 * Normaliza o assunto removendo prefixos repetidos de resposta/encaminhamento (Re:, Enc:, Fwd:, etc.).
 */
export function normalizeSubjectForThread(subject?: string): string {
  if (!subject) return '';
  const cleaned = subject
    .trim()
    .replace(REPLY_FORWARD_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (
    cleaned.length < 3 ||
    cleaned === '(sem assunto)' ||
    cleaned === '(no subject)' ||
    cleaned === 'sem assunto'
  ) {
    return '';
  }
  return cleaned;
}

export function hasReplyOrForwardPrefix(subject?: string): boolean {
  if (!subject) return false;
  return REPLY_FORWARD_PREFIX_RE.test(subject.trim());
}

/**
 * Normaliza um Message-ID removendo colchetes angulares e espaços.
 */
export function normalizeMessageId(raw?: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[<>]/g, '')
    .trim()
    .toLowerCase();
}

function extractEmailAddresses(raw?: string): string[] {
  if (!raw) return [];
  const matches = raw.match(/[^\s,;<>'"]+@[^\s,;<>'"]+\.[^\s,;<>'"]+/g) || [];
  return matches.map((m) => m.trim().toLowerCase());
}

function getParticipantSet(email: EmailItem): Set<string> {
  const set = new Set<string>();
  for (const addr of extractEmailAddresses(email.senderEmail)) set.add(addr);
  for (const addr of extractEmailAddresses(email.recipient)) set.add(addr);
  for (const addr of extractEmailAddresses(email.cc)) set.add(addr);
  return set;
}

function sharesParticipant(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

/**
 * Agrupa uma lista de e-mails em conversas (threads) usando RFC 5322
 * (Message-ID, In-Reply-To, References) com fallback inteligente por assunto normalizado.
 */
export function groupEmailsIntoThreads(
  emails: EmailItem[],
  sortOrder: 'desc' | 'asc' = 'desc'
): EmailThread[] {
  const n = emails.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let cur = x;
    while (parent[cur] !== root) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // 1. União por cabeçalhos RFC 5322 (Message-ID / In-Reply-To / References) dentro da mesma conta
  const msgIdOwner = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const email = emails[i];
    const accScope = email.accountId || '';
    const msgId = normalizeMessageId(email.messageIdHeader);
    if (msgId) {
      const key = `${accScope}::${msgId}`;
      const existing = msgIdOwner.get(key);
      if (existing !== undefined) {
        union(existing, i);
      } else {
        msgIdOwner.set(key, i);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const email = emails[i];
    const accScope = email.accountId || '';
    const refIds: string[] = [];
    const inReply = normalizeMessageId(email.inReplyToHeader);
    if (inReply) refIds.push(inReply);
    if (Array.isArray(email.referencesHeader)) {
      for (const r of email.referencesHeader) {
        const norm = normalizeMessageId(r);
        if (norm) refIds.push(norm);
      }
    }

    for (const refId of refIds) {
      const key = `${accScope}::${refId}`;
      const existing = msgIdOwner.get(key);
      if (existing !== undefined) {
        union(existing, i);
      } else {
        // Registra o ID referenciado apontando para este e-mail para conectar irmãos mesmo se a raiz não estiver na lista
        msgIdOwner.set(key, i);
      }
    }
  }

  // 2. Fallback por assunto normalizado (mesma conta + participantes em comum ou prefixo Re:/Enc:)
  const subjectBuckets = new Map<string, number[]>();
  const participantSets = emails.map(getParticipantSet);

  for (let i = 0; i < n; i++) {
    const email = emails[i];
    const normSubj = normalizeSubjectForThread(email.subject);
    if (!normSubj) continue;
    const key = `${email.accountId || ''}::${normSubj}`;
    const bucket = subjectBuckets.get(key);
    if (bucket) {
      bucket.push(i);
    } else {
      subjectBuckets.set(key, [i]);
    }
  }

  for (const indices of subjectBuckets.values()) {
    if (indices.length < 2) continue;
    for (let a = 0; a < indices.length; a++) {
      const idxA = indices[a];
      for (let b = a + 1; b < indices.length; b++) {
        const idxB = indices[b];
        if (find(idxA) === find(idxB)) continue;
        const eitherIsReply =
          hasReplyOrForwardPrefix(emails[idxA].subject) ||
          hasReplyOrForwardPrefix(emails[idxB].subject);
        if (eitherIsReply || sharesParticipant(participantSets[idxA], participantSets[idxB])) {
          union(idxA, idxB);
        }
      }
    }
  }

  // 3. Monta os grupos de conversas
  const groups = new Map<number, EmailItem[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(emails[i]);
    else groups.set(root, [emails[i]]);
  }

  const threads: EmailThread[] = [];
  for (const list of groups.values()) {
    // Ordena mensagens da thread cronologicamente (antiga -> mais recente) para leitura natural
    const sortedChrono = [...list].sort(
      (a, b) => getEmailTimestampMs(a) - getEmailTimestampMs(b)
    );
    const latestEmail = sortedChrono[sortedChrono.length - 1];
    const latestTimestampMs = getEmailTimestampMs(latestEmail);

    const unreadCount = sortedChrono.filter((m) => !m.isRead).length;
    const isStarred = sortedChrono.some((m) => Boolean(m.isStarred));
    const hasAttachment = sortedChrono.some((m) =>
      m.attachments && m.attachments.length > 0
        ? filterRealAttachments(m.attachments, m.bodyHtml).length > 0
        : Boolean(m.hasAttachment)
    );

    // Participantes únicos (ordem de aparição, com o remetente mais recente garantido)
    const seenParticipants = new Set<string>();
    const participants: string[] = [];
    for (const m of sortedChrono) {
      const label = (m.sender || m.senderEmail || 'Desconhecido').trim();
      const key = label.toLowerCase();
      if (!seenParticipants.has(key)) {
        seenParticipants.add(key);
        participants.push(label);
      }
    }

    threads.push({
      threadId: latestEmail.id,
      messages: sortedChrono,
      latestEmail,
      count: sortedChrono.length,
      unreadCount,
      hasUnread: unreadCount > 0,
      isStarred,
      hasAttachment,
      participants,
      latestTimestampMs,
    });
  }

  threads.sort((a, b) =>
    sortOrder === 'desc'
      ? b.latestTimestampMs - a.latestTimestampMs
      : a.latestTimestampMs - b.latestTimestampMs
  );

  return threads;
}

/**
 * Retorna todas as mensagens da mesma conversa (incluindo respostas em Enviados)
 * ordenadas cronologicamente da mais antiga para a mais recente.
 */
export function getThreadMessagesForEmail(
  targetEmail: EmailItem,
  allEmails: EmailItem[]
): EmailItem[] {
  const inTrashOrJunk = targetEmail.folder === 'trash' || targetEmail.folder === 'junk';
  const candidates = allEmails.filter((e) => {
    if (targetEmail.accountId && e.accountId && e.accountId !== targetEmail.accountId) {
      return false;
    }
    if (!inTrashOrJunk && (e.folder === 'trash' || e.folder === 'junk')) {
      return false;
    }
    return true;
  });

  if (!candidates.some((e) => e.id === targetEmail.id)) {
    candidates.push(targetEmail);
  }

  const threads = groupEmailsIntoThreads(candidates, 'desc');
  const match = threads.find((t) => t.messages.some((m) => m.id === targetEmail.id));
  return match ? match.messages : [targetEmail];
}
